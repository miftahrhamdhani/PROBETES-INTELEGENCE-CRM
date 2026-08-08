"use server";

/**
 * Server Action halaman Group Membership.
 *
 * Guard memakai pola YANG SAMA dengan customers-actions.ts (`requireRole`):
 * Server Action adalah endpoint POST publik dan action id Next.js bersifat
 * global, jadi setiap action wajib punya authorization sendiri — middleware
 * per-path saja tidak cukup.
 *
 * File ini HANYA meng-export fungsi async. Skema Zod-nya sengaja tinggal di
 * lib/group-membership-types.ts, karena file "use server" tidak boleh
 * meng-export nilai non-fungsi (build Next.js akan gagal).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import {
  getGroupMemberDetail,
  getGroupMembershipKpi,
  listGroupMembers,
  listGroupNames,
} from "@/server/membership/queries";
import { commitGroupImport, previewGroupImport } from "@/server/membership/group-import";
import { editGroupMembershipSchema, groupMemberFilterSchema } from "@/lib/group-membership-types";
import { revalidateAnalytics } from "@/server/analytics/cache";
import { updateMembership } from "@/server/membership/service";
import { groupImportPayloadSchema } from "@/lib/group-import-contracts";
import type { GroupImportPreview, GroupImportResult } from "@/lib/group-import-contracts";
import type {
  GroupMemberDetail,
  GroupMemberListResult,
  GroupMembershipKpi,
} from "@/lib/group-membership-types";

/** Sama dengan halaman Customers/Group Membership existing (lihat src/lib/roles.ts). */
const requireGroupAccess = () => requireRole("ADMIN", "CRM");

export async function loadGroupMembersAction(input: unknown): Promise<GroupMemberListResult> {
  await requireGroupAccess();
  return listGroupMembers(groupMemberFilterSchema.parse(input ?? {}));
}

export async function loadGroupMembershipKpiAction(): Promise<GroupMembershipKpi> {
  await requireGroupAccess();
  return getGroupMembershipKpi();
}

export async function loadGroupNamesAction(): Promise<string[]> {
  await requireGroupAccess();
  return listGroupNames();
}

export async function loadGroupMemberDetailAction(customerId: unknown): Promise<GroupMemberDetail | null> {
  await requireGroupAccess();
  return getGroupMemberDetail(z.coerce.number().int().positive().parse(customerId));
}

export async function editGroupMembershipAction(customerId: unknown, input: unknown): Promise<void> {
  const actor = await requireGroupAccess();
  const body = editGroupMembershipSchema.parse(input);
  await updateMembership({
    customerId: z.coerce.number().int().positive().parse(customerId),
    status: "GROUPED",
    groupName: body.groupName,
    joinedAt: body.joinedAt,
    picUserId: body.picUserId,
    notes: body.notes,
    updatedByUserId: Number(actor.id),
  });
  revalidateAnalytics();
  revalidatePath("/groups");
}

/** Mengeluarkan dari grup, bukan menghapus customer atau transaksi. */
export async function removeGroupMembershipAction(customerId: unknown): Promise<void> {
  const actor = await requireGroupAccess();
  await updateMembership({
    customerId: z.coerce.number().int().positive().parse(customerId),
    status: "NOT_GROUPED",
    groupName: null,
    joinedAt: null,
    picUserId: null,
    notes: null,
    updatedByUserId: Number(actor.id),
  });
  revalidateAnalytics();
  revalidatePath("/groups");
}

/** Preview import — TIDAK menulis apa pun ke database. */
export async function previewGroupImportAction(input: unknown): Promise<GroupImportPreview> {
  await requireGroupAccess();
  return previewGroupImport(groupImportPayloadSchema.parse(input));
}

/**
 * Commit import. Menghitung ULANG klasifikasi di server — hasil preview yang
 * dikirim client tidak pernah dipercaya sebagai dasar penulisan.
 */
export async function commitGroupImportAction(input: unknown): Promise<GroupImportResult> {
  const actor = await requireGroupAccess();
  const actorId = Number(actor.id);
  if (!Number.isInteger(actorId)) throw new Error("Sesi tidak valid");
  return commitGroupImport(groupImportPayloadSchema.parse(input), actorId);
}
