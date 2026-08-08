import { sql, type SQL } from "drizzle-orm";

/**
 * SUMBER TUNGGAL provenance order Workspace.
 *
 * Batas domain: **Database All ≠ Workspace Pesanan**.
 * - Database All adalah domain Analysis / Customer Intelligence (orders/order_items
 *   legacy, RFM, Cohort, Frequency, Cluster). Ia TIDAK BOLEH membuat
 *   `workspace_orders`/`workspace_order_items`.
 * - Workspace Pesanan adalah sistem baru. Satu-satunya provenance yang sah
 *   adalah `source_type = 'MANUAL'`, yaitu pesanan yang lahir dari form
 *   Input Pesanan Workspace.
 *
 * Kenapa `source_type`, BUKAN yang lain:
 * - `sales_source` = sumber PENJUALAN bisnis (WA, TikTok, dst) — bukan asal data.
 *   Memakainya sebagai provenance mencampur dua konsep yang berbeda.
 * - `workspace_generation` = ANGKATAN data (lihat generation.ts). Baris
 *   DATABASE_ALL dan MANUAL bisa berada di generation yang SAMA, jadi generation
 *   tidak pernah bisa memisahkan keduanya.
 *
 * Baris `source_type = 'DATABASE_ALL'` yang terlanjur bocor sebelum batas ini
 * ditegakkan SENGAJA dibiarkan di database untuk jejak audit — ia cukup tidak
 * terlihat dan tidak terhitung oleh read-model Workspace, bukan dihapus.
 *
 * Setiap query baca `workspace_orders` WAJIB lewat helper ini, BUKAN string
 * literal `source_type = 'MANUAL'` yang disalin ke tiap service (persis pola
 * activeGenerationCondition/notDeletedCondition).
 */
export const WORKSPACE_ORDER_SOURCE_TYPE = "MANUAL";

/**
 * Kondisi SQL "order Workspace yang sah" untuk tabel `workspace_orders`.
 * `alias` = alias tabel di query pemanggil (mis. `o`), atau kosong bila query
 * tidak memakai alias.
 */
export function workspaceManualOrderScope(alias = "o"): SQL {
  const column = alias ? sql.raw(`${alias}.source_type`) : sql.raw("source_type");
  return sql`${column} = ${WORKSPACE_ORDER_SOURCE_TYPE}`;
}
