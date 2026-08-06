import { sql, type SQL } from "drizzle-orm";

/**
 * SUMBER TUNGGAL generation Workspace aktif.
 *
 * `workspace_orders.workspace_generation` menandai "angkatan" data Workspace.
 * Fresh start CRM V1 memakai `CRM_FRESH_V1`; kalau suatu saat dibuat angkatan
 * baru (mis. reset pembukuan), baris lama TIDAK boleh ikut terhitung di
 * laporan angkatan aktif.
 *
 * Sebelumnya kolom ini hanya diisi default dan TIDAK PERNAH dibaca satu query
 * pun — aturan "hanya generation aktif" secara de facto tidak berlaku dan baru
 * akan terlihat rusak saat angkatan kedua dibuat (seluruh KPI diam-diam
 * menjumlahkan dua angkatan). Karena itu filternya sekarang wajib lewat helper
 * di bawah, BUKAN string literal yang disalin ke tiap service.
 */
export const ACTIVE_WORKSPACE_GENERATION = "CRM_FRESH_V1";

/**
 * Kondisi SQL "hanya generation aktif" untuk tabel `workspace_orders`.
 * `alias` = alias tabel di query pemanggil (mis. `o`), atau kosong bila query
 * tidak memakai alias.
 */
export function activeGenerationCondition(alias = "o"): SQL {
  const column = alias ? sql.raw(`${alias}.workspace_generation`) : sql.raw("workspace_generation");
  return sql`${column} = ${ACTIVE_WORKSPACE_GENERATION}`;
}

/**
 * Kondisi SQL "belum dihapus" untuk `workspace_orders` (fitur soft delete
 * Pesanan) — helper terpisah dari generation di atas, tapi alasannya SAMA:
 * setiap query baca `workspace_orders` WAJIB memfilter ini lewat helper
 * bersama, bukan string literal `deleted_at IS NULL` yang disalin ke tiap
 * service, supaya tidak ada jalur yang lupa (persis pola activeGenerationCondition).
 */
export function notDeletedCondition(alias = "o"): SQL {
  const column = alias ? sql.raw(`${alias}.deleted_at`) : sql.raw("deleted_at");
  return sql`${column} IS NULL`;
}
