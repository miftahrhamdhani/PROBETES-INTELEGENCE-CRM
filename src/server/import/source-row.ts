import type { SourceRow } from "./types";

/** Header Excel/CSV kadang punya leading/trailing space ("pembayaran ", " Total
 *  Harga ") — kadang berubah antar-export file yang sama. Lookup toleran spasi
 *  supaya parser tidak diam-diam membaca `undefined` (-> 0/kosong) saat header
 *  sumber berubah format tanpa mengubah nama kolom secara semantik. */
export function sourceValue(row: SourceRow, name: string): unknown {
  const direct = row.values[name];
  if (direct !== undefined) return direct;
  const key = Object.keys(row.values).find((k) => k.trim() === name);
  return key ? row.values[key] : undefined;
}
