"use server";

import { z } from "zod";
import {
  getClusterDistribution,
  getCustomerDetail,
  getMembershipSummary,
  listClusterCustomers,
  listCsAgents,
  listCustomers,
  listPics,
  quickSearchCustomers,
} from "@/server/analytics/customers";
import { updateMembershipSchema } from "@/lib/membership-contracts";
import { updateCustomerProfileSchema } from "@/lib/customer-crud-contracts";
import {
  customerListFilterSchema,
  idSchema,
  pageNumberSchema,
} from "@/lib/list-filter-contracts";
import { CUSTOMER_LIST_CHUNK } from "@/lib/list-chunk";
import { requireRole } from "@/server/auth/guards";
import { revalidateAnalytics } from "@/server/analytics/cache";
import { updateMembership } from "@/server/membership/service";
import { listCustomerProfileHistory, setCustomerArchived, updateCustomerProfile } from "@/server/customer/service";

/**
 * SELURUH action di file ini mengembalikan PII (nama, No. HP, alamat, riwayat
 * transaksi) — karena itu setiap satunya WAJIB `requireRole("ADMIN", "CRM")`,
 * termasuk action baca.
 *
 * Middleware TIDAK cukup: middleware menyaring per-path, sedangkan action id
 * Next.js bersifat global sehingga action apa pun bisa dipanggil lewat POST ke
 * path mana pun yang boleh diakses pemanggil (mis. MANAGEMENT yang berhak atas
 * "/" tapi ditolak di "/customers"). Authorization harus ada di dalam action.
 * Matriks role: src/lib/roles.ts (/customers & /groups = ADMIN, CRM).
 */
const requireCustomerAccess = () => requireRole("ADMIN", "CRM");

/** Search global di GlobalHeader — lihat quickSearchCustomers untuk kenapa ini
 *  query terpisah dari loadCustomerList (payload jauh lebih ringan, dipanggil
 *  per keystroke). MANAGEMENT tidak berhak (sama seperti /customers) — komponen
 *  pemanggil (GlobalSearch) menyembunyikan dirinya sendiri untuk role itu,
 *  guard ini tetap jaring pengaman sisi server. */
export async function searchCustomersQuickAction(query: unknown) {
  await requireCustomerAccess();
  return quickSearchCustomers(z.string().max(200).parse(query));
}

export async function loadCustomerList(filter: unknown) {
  await requireCustomerAccess();
  return listCustomers(customerListFilterSchema.parse(filter));
}

/** Dipakai infinite scroll (useInfiniteRows) — page/perPage tetap server-side,
 *  hanya dipanggil berulang dengan page naik dan hasil digabung di client. */
export async function loadCustomerListPage(filter: unknown, page: unknown) {
  await requireCustomerAccess();
  const parsed = customerListFilterSchema.parse(filter);
  return listCustomers({ ...parsed, page: pageNumberSchema.parse(page), perPage: CUSTOMER_LIST_CHUNK });
}

export async function loadCustomerDetail(customerId: unknown) {
  await requireCustomerAccess();
  return getCustomerDetail(idSchema.parse(customerId));
}

export async function loadClusterDistribution() {
  await requireCustomerAccess();
  return getClusterDistribution();
}

export async function loadClusterCustomerList(filter: unknown) {
  await requireCustomerAccess();
  return listClusterCustomers(customerListFilterSchema.parse(filter));
}

/** Infinite scroll untuk tabel /cluster — sama polanya dengan loadCustomerListPage. */
export async function loadClusterCustomerListPage(filter: unknown, page: unknown) {
  await requireCustomerAccess();
  const parsed = customerListFilterSchema.parse(filter);
  return listClusterCustomers({ ...parsed, page: pageNumberSchema.parse(page), perPage: CUSTOMER_LIST_CHUNK });
}

export async function loadCsAgents() {
  await requireCustomerAccess();
  return listCsAgents();
}

export async function loadPics() {
  await requireCustomerAccess();
  return listPics();
}

export async function loadMembershipSummary() {
  await requireCustomerAccess();
  return getMembershipSummary();
}

/** Satu-satunya jalur tulis membership dari UI — lewat service yang sama dengan
 *  API route PATCH /api/customers/[id]/membership, tidak ada logic terduplikasi. */
export async function updateCustomerMembership(customerId: unknown, input: unknown) {
  const user = await requireCustomerAccess();
  const id = idSchema.parse(customerId);
  const body = updateMembershipSchema.parse(input);
  const result = await updateMembership({
    customerId: id,
    status: body.status,
    groupName: body.groupName ?? null,
    joinedAt: body.joinedAt ?? null,
    picUserId: body.picUserId ?? null,
    notes: body.notes ?? null,
    updatedByUserId: Number(user.id),
  });
  // has_group menentukan C-Prodig/C-HP/C-F2 vs D/Dhp -> cluster berubah ->
  // agregat analytics ikut basi. Dibatalkan SETELAH tulis berhasil.
  revalidateAnalytics();
  return result;
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
export async function updateCustomerProfileAction(customerId: unknown, input: unknown): Promise<void> {
  const user = await requireCustomerAccess();
  const id = idSchema.parse(customerId);
  const body = updateCustomerProfileSchema.parse(input);
  await updateCustomerProfile(id, body, Number(user.id));
}

export async function loadCustomerProfileHistory(customerId: unknown) {
  await requireCustomerAccess();
  return listCustomerProfileHistory(idSchema.parse(customerId));
}

export async function setCustomerArchivedAction(customerId: unknown, archived: unknown): Promise<void> {
  const user = await requireCustomerAccess();
  const id = idSchema.parse(customerId);
  await setCustomerArchived(id, Boolean(archived), Number(user.id));
}
