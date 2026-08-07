/**
 * SHARED — validasi Zod untuk seluruh filter daftar yang dikirim dari client
 * ke Server Action. Tanpa I/O, tanpa React.
 *
 * Kenapa ada: Server Action adalah endpoint POST publik. Filter yang masuk
 * harus divalidasi bentuknya sendiri, tidak boleh percaya tipe TypeScript saja
 * (tipe hilang saat runtime). `z.object()` juga MEMBUANG key asing, sehingga
 * properti yang tidak dikenal tidak pernah sampai ke pembangun SQL.
 *
 * Angka dikirim client kadang sebagai string (dari searchParams) — karena itu
 * dipakai `z.coerce`, bukan `z.number()` polos.
 */
import { z } from "zod";
import { MEMBERSHIP_STATUSES } from "./membership-contracts";
import { CRM_TASK_OUTCOMES, CRM_TASK_STATUSES, CRM_TASK_TYPES } from "./workspace-contracts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");
const cohortMonth = z.string().regex(/^\d{4}-\d{2}$/, "Format bulan YYYY-MM");
const shortText = z.string().trim().max(200);
const nonNegativeInt = z.coerce.number().int().min(0);
const positiveInt = z.coerce.number().int().min(1);
/** Batas atas rupiah — cukup longgar untuk data nyata, cukup ketat untuk menolak sampah. */
const money = z.coerce.number().int().min(0).max(1_000_000_000_000);

export const customerListFilterSchema = z.object({
  search: shortText.optional(),
  cs: shortText.optional(),
  cluster: z.string().trim().max(40).optional(),
  membershipStatus: z.enum([...MEMBERSHIP_STATUSES, "CONFLICT"]).optional(),
  pic: shortText.optional(),
  cohortMonth: cohortMonth.optional(),
  frequency: nonNegativeInt.optional(),
  frequencyMin: nonNegativeInt.optional(),
  activeMonthIndex: nonNegativeInt.max(600).optional(),
  orderNumber: positiveInt.max(10_000).optional(),
  orderDateFrom: isoDate.optional(),
  orderDateTo: isoDate.optional(),
  recencyMin: nonNegativeInt.optional(),
  recencyMax: nonNegativeInt.optional(),
  monetaryMin: money.optional(),
  monetaryMax: money.optional(),
  includeArchived: z.coerce.boolean().optional(),
  isNew: z.coerce.boolean().optional(),
  page: positiveInt.optional(),
  perPage: positiveInt.max(200).optional(),
  /** Cursor pagination — lihat src/server/analytics/customers.ts. */
  cursor: z.string().trim().max(120).optional(),
});
export type CustomerListFilterInput = z.infer<typeof customerListFilterSchema>;

export const workspaceTaskListFilterSchema = z.object({
  search: shortText.optional(),
  pic: z.union([z.coerce.number().int().positive(), z.literal("UNASSIGNED")]).optional(),
  status: z.enum(CRM_TASK_STATUSES).optional(),
  /** Tab Pembagian Tugas (Broadcast = ASSIGNED + IN_PROGRESS). Dibatasi max 5
   *  = jumlah status yang ada, supaya payload tidak bisa digelembungkan. */
  statuses: z.array(z.enum(CRM_TASK_STATUSES)).min(1).max(5).optional(),
  taskType: z.enum(CRM_TASK_TYPES).optional(),
  outcome: z.enum(CRM_TASK_OUTCOMES).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  overdueOnly: z.coerce.boolean().optional(),
  page: positiveInt.optional(),
  perPage: positiveInt.max(200).optional(),
  cursor: z.string().trim().max(120).optional(),
});

/** Halaman list yang dipanggil infinite scroll — page selalu >= 1. */
export const pageNumberSchema = positiveInt.max(100_000);

/** Id numerik dari client (detail customer/report/task). */
export const idSchema = z.coerce.number().int().positive();
