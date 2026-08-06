/** SHARED — ukuran batch infinite scroll. Konstanta murni, tanpa I/O — "use
 *  server" file (customers-actions.ts, workspace-actions.ts) hanya boleh
 *  meng-export async function, jadi konstanta ini harus tinggal di luar situ. */
export const CUSTOMER_LIST_CHUNK = 60;
export const WORKSPACE_TASK_LIST_CHUNK = 60;

/**
 * Batas baris satu file export. Export SELALU meliputi seluruh hasil filter
 * aktif (bukan halaman yang sedang dilihat), jadi angkanya jauh di atas page
 * size tabel — tapi tetap berbatas supaya satu request tidak menarik dataset
 * tak terhingga ke memori.
 *
 * TIDAK boleh dilewatkan ke `.parse()` skema filter: batas `perPage` di skema
 * itu melindungi input dari URL user. Route export menimpanya SETELAH parse
 * (lihat src/app/api/workspace/**\/export.*), bukan sebelum.
 */
export const WORKSPACE_EXPORT_MAX_ROWS = 5000;
