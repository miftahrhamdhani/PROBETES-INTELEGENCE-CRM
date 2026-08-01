"use server";

import {
  getClusterDistribution,
  getCustomerDetail,
  getMembershipSummary,
  listClusterCustomers,
  listCsAgents,
  listCustomers,
  listPics,
} from "@/server/analytics/customers";
import type { CustomerListFilter } from "@/lib/customer-types";
import { updateMembershipSchema } from "@/lib/membership-contracts";
import { updateCustomerProfileSchema } from "@/lib/customer-crud-contracts";
import { CUSTOMER_LIST_CHUNK } from "@/lib/list-chunk";
import { requireRole } from "@/server/auth/guards";
import { updateMembership } from "@/server/membership/service";
import { listCustomerProfileHistory, setCustomerArchived, updateCustomerProfile } from "@/server/customer/service";

export async function loadCustomerList(filter: CustomerListFilter) {
  return listCustomers(filter);
}

/** Dipakai infinite scroll (useInfiniteRows) — page/perPage tetap server-side,
 *  hanya dipanggil berulang dengan page naik dan hasil digabung di client. */
export async function loadCustomerListPage(
  filter: Omit<CustomerListFilter, "page" | "perPage">,
  page: number
) {
  return listCustomers({ ...filter, page, perPage: CUSTOMER_LIST_CHUNK });
}

export async function loadCustomerDetail(customerId: number) {
  return getCustomerDetail(customerId);
}

export async function loadClusterDistribution() {
  return getClusterDistribution();
}

export async function loadClusterCustomerList(filter: CustomerListFilter) {
  return listClusterCustomers(filter);
}

/** Infinite scroll untuk tabel /cluster — sama polanya dengan loadCustomerListPage. */
export async function loadClusterCustomerListPage(
  filter: Omit<CustomerListFilter, "page" | "perPage">,
  page: number
) {
  return listClusterCustomers({ ...filter, page, perPage: CUSTOMER_LIST_CHUNK });
}

export async function loadCsAgents() {
  return listCsAgents();
}

export async function loadPics() {
  return listPics();
}

export async function loadMembershipSummary() {
  return getMembershipSummary();
}

/** Satu-satunya jalur tulis membership dari UI — lewat service yang sama dengan
 *  API route PATCH /api/customers/[id]/membership, tidak ada logic terduplikasi. */
export async function updateCustomerMembership(customerId: number, input: unknown) {
  const user = await requireRole("ADMIN", "CRM");
  const body = updateMembershipSchema.parse(input);
  return updateMembership({
    customerId,
    status: body.status,
    groupName: body.groupName ?? null,
    joinedAt: body.joinedAt ?? null,
    picUserId: body.picUserId ?? null,
    notes: body.notes ?? null,
    updatedByUserId: Number(user.id),
  });
}

/**
 * CRUD Customer — hanya koreksi profil (nama/alamat/No HP) & archive.
 * RFM/Frequency/Monetary/Cluster/transaksi tetap read-only, tidak ada jalur
 * tulis untuk itu di sini.
 *
 * TIDAK ADA create-customer manual: aturan populasi CRM final (lihat
 * docs/07-OPEN-QUESTIONS.md) mewajibkan setiap canonical customer punya
 * minimal satu transaksi valid — customer hanya boleh masuk lewat import
 * (Database All / KSB), tidak pernah dibuat dari nol tanpa transaksi.
 * TIDAK ADA hard-delete: customer yang sudah punya order tidak bisa dihapus
 * (foreign key) — kalau perlu disembunyikan, pakai archive.
 */
export async function updateCustomerProfileAction(customerId: number, input: unknown): Promise<void> {
  const user = await requireRole("ADMIN", "CRM");
  const body = updateCustomerProfileSchema.parse(input);
  await updateCustomerProfile(customerId, body, Number(user.id));
}

export async function loadCustomerProfileHistory(customerId: number) {
  await requireRole("ADMIN", "CRM");
  return listCustomerProfileHistory(customerId);
}

export async function setCustomerArchivedAction(customerId: number, archived: boolean): Promise<void> {
  const user = await requireRole("ADMIN", "CRM");
  await setCustomerArchived(customerId, archived, Number(user.id));
}
