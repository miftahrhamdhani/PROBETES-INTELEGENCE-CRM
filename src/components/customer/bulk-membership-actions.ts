import { loadCustomerDetail, setCustomerArchivedAction, updateCustomerMembership } from "@/app/customers-actions";
import type { UpdateMembershipBody } from "@/lib/membership-contracts";

export type BulkActionResult = { succeeded: number; failed: { customerId: number; error: string }[] };

/**
 * Bulk membership (Tambah ke Grup / Ubah PIC / Hapus dari Grup) TIDAK punya
 * endpoint tulis baru — dijalankan dengan MELOOP dua Server Action yang sudah
 * ada: `loadCustomerDetail` (baca membership lengkap customer ini) lalu
 * `updateCustomerMembership` (satu-satunya jalur tulis, sudah transactional +
 * rekalkulasi cluster). Dibaca dulu supaya field yang TIDAK diedit dialog ini
 * (notes/joinedAt/dst) tidak ikut tertimpa kosong — `patch` hanya berisi field
 * yang memang ingin diubah.
 *
 * Sequential (bukan Promise.all): menghindari membanjiri connection pool Neon
 * saat user memilih ratusan baris sekaligus, dan supaya progress bisa dilaporkan
 * apa adanya per customer kalau salah satu gagal (mis. race dengan edit lain).
 */
export async function applyBulkMembershipPatch(
  customerIds: number[],
  patch: Partial<Pick<UpdateMembershipBody, "status" | "groupName" | "joinedAt" | "picUserId" | "notes">>
): Promise<BulkActionResult> {
  const failed: { customerId: number; error: string }[] = [];
  let succeeded = 0;

  for (const customerId of customerIds) {
    try {
      const detail = await loadCustomerDetail(customerId);
      if (!detail) throw new Error("Customer tidak ditemukan");
      await updateCustomerMembership(customerId, {
        status: patch.status ?? detail.membership.status,
        groupName: patch.groupName !== undefined ? patch.groupName : detail.membership.groupName,
        joinedAt: patch.joinedAt !== undefined ? patch.joinedAt : detail.membership.joinedAt,
        picUserId: patch.picUserId !== undefined ? patch.picUserId : detail.membership.picUserId,
        notes: patch.notes !== undefined ? patch.notes : detail.membership.notes,
      });
      succeeded += 1;
    } catch (error) {
      failed.push({ customerId, error: error instanceof Error ? error.message : "Gagal menyimpan" });
    }
  }

  return { succeeded, failed };
}

export async function applyBulkArchive(customerIds: number[], archived: boolean): Promise<BulkActionResult> {
  const failed: { customerId: number; error: string }[] = [];
  let succeeded = 0;

  for (const customerId of customerIds) {
    try {
      await setCustomerArchivedAction(customerId, archived);
      succeeded += 1;
    } catch (error) {
      failed.push({ customerId, error: error instanceof Error ? error.message : "Gagal menyimpan" });
    }
  }

  return { succeeded, failed };
}
