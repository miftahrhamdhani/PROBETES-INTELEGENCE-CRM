import type { SourceRow } from "./types";

/**
 * Nama kolom kanonik -> daftar nama alternatif yang ditemukan di export lain
 * dari data yang sama secara semantik (mis. sheet "allbaru" pakai "Tanggal
 * Pesanan", export CSV master order lain pakai "Tanggal" saja untuk kolom
 * yang sama — tanggal pesanan). Tambah di sini kalau ada varian header baru
 * ditemukan; JANGAN dipakai untuk mengubah arti kolom, hanya nama.
 */
const COLUMN_ALIASES: Record<string, readonly string[]> = {
  "Tanggal Pesanan": ["Tanggal"],
};

function findKey(row: SourceRow, name: string): string | undefined {
  if (row.values[name] !== undefined) return name;
  const trimmedMatch = Object.keys(row.values).find((k) => k.trim() === name);
  if (trimmedMatch) return trimmedMatch;
  for (const alias of COLUMN_ALIASES[name] ?? []) {
    const aliasMatch = Object.keys(row.values).find((k) => k.trim() === alias);
    if (aliasMatch) return aliasMatch;
  }
  return undefined;
}

/** Header Excel/CSV kadang punya leading/trailing space ("pembayaran ", " Total
 *  Harga ") atau nama kolom berbeda antar-export data yang sama secara semantik
 *  (lihat COLUMN_ALIASES) — kadang berubah antar-export file yang sama. Lookup
 *  toleran spasi & alias supaya parser tidak diam-diam membaca `undefined`
 *  (-> 0/kosong) saat header sumber berubah format tanpa mengubah nama kolom
 *  secara semantik. */
export function sourceValue(row: SourceRow, name: string): unknown {
  const key = findKey(row, name);
  return key ? row.values[key] : undefined;
}

/** Dipakai assertDatabaseAllColumns — kolom wajib dianggap ada kalau nama
 *  kanonik ATAU salah satu aliasnya muncul di header file. */
export function hasColumn(headers: ReadonlySet<string>, name: string): boolean {
  if (headers.has(name)) return true;
  return (COLUMN_ALIASES[name] ?? []).some((alias) => headers.has(alias));
}
