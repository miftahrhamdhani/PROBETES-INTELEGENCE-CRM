/**
 * SHARED — tipe halaman Group Membership. Tanpa I/O, tanpa React.
 *
 * Halaman ini HANYA menampilkan customer yang SUDAH masuk grup (status GROUPED).
 * NOT_GROUPED/UNKNOWN tetap tersimpan di database untuk kebutuhan cluster engine,
 * tapi tidak pernah muncul di daftar ini.
 */
import { z } from "zod";
import type { ClusterAssignmentCode } from "./cluster-codes";
import type { ClusterReason } from "./customer-types";

/** Asal-usul membership — dipetakan ke label "Sumber Update" di tabel. */
export type GroupMembershipSourceValue =
  | "LEGACY_MASUK_WA"
  | "LEGACY_BACKUP_MASUK_GRUP"
  | "LEGACY_TIDAK_MASUK_WA"
  | "CRM_MANUAL"
  | "GROUP_IMPORT";

export const GROUP_SOURCE_LABELS: Record<GroupMembershipSourceValue, string> = {
  LEGACY_MASUK_WA: "Legacy",
  LEGACY_BACKUP_MASUK_GRUP: "Legacy",
  LEGACY_TIDAK_MASUK_WA: "Legacy",
  CRM_MANUAL: "Manual",
  GROUP_IMPORT: "Import",
};

export type GroupMemberRow = {
  customerId: number;
  normalizedPhone: string;
  displayName: string;
  clusterCode: ClusterAssignmentCode | null;
  /** null selama belum pernah diisi import/manual — TIDAK ditebak dari data lain. */
  groupName: string | null;
  picUserId: number | null;
  picName: string | null;
  /** Tanggal masuk grup. null untuk membership legacy yang memang tidak punya
   *  tanggal — sengaja dibiarkan kosong, bukan diisi perkiraan. */
  joinedAt: string | null;
  lastOrderDate: string | null;
  source: GroupMembershipSourceValue;
};

export type GroupMemberListResult = {
  rows: GroupMemberRow[];
  total: number;
  page: number;
  perPage: number;
};

export type GroupMemberDetail = GroupMemberRow & {
  notes: string | null;
  firstOrderDate: string | null;
  frequency: number;
  monetary: string;
  /** Produk & channel order terakhir — dari data order yang sudah ada. */
  lastProductName: string | null;
  lastOrderDivision: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  clusterReason: ClusterReason | null;
  clusterAsOfDate: string | null;
};

export const editGroupMembershipSchema = z.object({
  groupName: z.string().trim().max(255).nullable(),
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  picUserId: z.number().int().positive().nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

export type GroupMembershipKpi = {
  /** Customer yang benar-benar sudah masuk grup. */
  totalMembers: number;
  /** Membership dengan joined_at pada bulan berjalan. 0 selama joined_at belum
   *  pernah terisi — angka apa adanya, tidak diperkirakan dari history. */
  newThisMonth: number;
  /** Jumlah nama grup berbeda yang sedang dipakai. 0 kalau group_name kosong. */
  activeGroups: number;
  /** Baris yang tidak ketemu customer-nya pada import grup TERAKHIR. null kalau
   *  belum pernah ada import grup. */
  unmatchedLastImport: number | null;
  lastUpdatedAt: string | null;
  lastUpdatedByName: string | null;
};

/**
 * Validasi filter dari client. Ditaruh di sini (bukan di file "use server")
 * karena file Server Action hanya boleh meng-export fungsi async — meng-export
 * skema Zod dari sana membuat build gagal dengan
 * "A use server file can only export async functions".
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");
const shortText = z.string().trim().max(200);

export const groupMemberFilterSchema = z.object({
  search: shortText.optional(),
  cluster: z.string().trim().max(40).optional(),
  groupName: shortText.optional(),
  pic: shortText.optional(),
  /** Rentang TANGGAL MASUK GRUP (joined_at) — bukan tanggal order. */
  joinedFrom: isoDate.optional(),
  joinedTo: isoDate.optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(200).optional(),
});

export type GroupMemberFilter = z.infer<typeof groupMemberFilterSchema>;
