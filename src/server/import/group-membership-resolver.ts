import type { GroupListEntry } from "./types";

export type MembershipStatus = "GROUPED" | "NOT_GROUPED" | "UNKNOWN";
export type MembershipSource =
  | "LEGACY_MASUK_WA"
  | "LEGACY_BACKUP_MASUK_GRUP"
  | "LEGACY_TIDAK_MASUK_WA"
  | "CRM_MANUAL";

export interface ResolvedMembership {
  normalizedPhone: string;
  status: MembershipStatus;
  source: MembershipSource;
  /** Ada di (masukWA ∪ BackupMasukGrup) DAN tidakmasukWA sekaligus — tidak ada
   *  timestamp untuk tahu mana yang terbaru, jadi TIDAK auto-resolve ke salah
   *  satu sisi. status selalu UNKNOWN di kasus ini. */
  conflict: boolean;
}

/**
 * Resolusi status membership dari 3 sheet legacy — fungsi murni, tanpa I/O.
 *
 * Aturan (dikonfirmasi user):
 * - masukWA ∪ BackupMasukGrup (dan TIDAK ada di tidakmasukWA) -> GROUPED.
 *   Union dipakai karena hanya union yang cocok 100% dengan populasi C-Prodig
 *   hasil engine (masukWA saja cuma 98.6%) — lihat laporan reconciliation.
 * - tidakmasukWA saja (tidak ada di masukWA/BackupMasukGrup) -> NOT_GROUPED.
 * - Ada di GROUPED-union DAN tidakmasukWA sekaligus -> UNKNOWN + conflict=true
 *   (tidak ada timestamp untuk menentukan yang terbaru, tidak boleh ditebak).
 * - Tidak ada di source manapun -> tidak masuk hasil sama sekali (caller tidak
 *   menulis baris; current-state table tanpa baris = UNKNOWN via COALESCE).
 */
export function resolveMembershipBackfill(
  masukWa: GroupListEntry[],
  backupMasukGrup: GroupListEntry[],
  tidakMasukWa: GroupListEntry[]
): ResolvedMembership[] {
  const masukWaSet = new Set(masukWa.map((e) => e.normalizedPhone));
  const backupSet = new Set(backupMasukGrup.map((e) => e.normalizedPhone));
  const tidakSet = new Set(tidakMasukWa.map((e) => e.normalizedPhone));

  const allPhones = new Set([...masukWaSet, ...backupSet, ...tidakSet]);
  const results: ResolvedMembership[] = [];

  for (const phone of allPhones) {
    const inMasukWa = masukWaSet.has(phone);
    const inBackup = backupSet.has(phone);
    const inTidak = tidakSet.has(phone);
    const inGroupedUnion = inMasukWa || inBackup;
    const source: MembershipSource = inMasukWa ? "LEGACY_MASUK_WA" : "LEGACY_BACKUP_MASUK_GRUP";

    if (inGroupedUnion && inTidak) {
      results.push({ normalizedPhone: phone, status: "UNKNOWN", source, conflict: true });
    } else if (inGroupedUnion) {
      results.push({ normalizedPhone: phone, status: "GROUPED", source, conflict: false });
    } else {
      results.push({
        normalizedPhone: phone,
        status: "NOT_GROUPED",
        source: "LEGACY_TIDAK_MASUK_WA",
        conflict: false,
      });
    }
  }

  return results.sort((a, b) => a.normalizedPhone.localeCompare(b.normalizedPhone));
}
