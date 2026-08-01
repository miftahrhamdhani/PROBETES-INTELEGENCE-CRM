/**
 * Katalog produk canonical + alias awal — hasil bedah data asli
 * (docs/06-DATA-FINDINGS.md §8, docs/07-OPEN-QUESTIONS.md Q5/Q6/Q7).
 *
 * Ini adalah SEED AWAL yang sudah "disetujui" (approved_at terisi saat seeding,
 * lihat scripts/seed-products.ts) — bukan mapping otomatis diam-diam untuk produk
 * BARU. Produk yang tidak dikenali di sini (fallback classifier menghasilkan
 * UNKNOWN) wajib melalui halaman Product Mapping (FR-25) sebelum di-approve admin.
 *
 * Fungsi murni — tanpa I/O.
 */

import { cleanText } from "./text";

export const CANONICAL_PRODUCT_CODES = [
  "HERBAL_PROBETES",
  "SEREAL_AMANDIA",
  "AMANDIA_MUESLI",
  "PROBETES_OIL",
  "BERAS",
  "MINYAK_CCO",
  "MINYAK_KELAPA",
  "MINYAK_VCO",
  "BUKU_MENUJU_REMISI",
  "BUKU_KURUS",
  "EBOOK",
  "STEVIA",
  "YACONA", // payung untuk seluruh lini KSB — lihat docs/02-CLUSTER-RULES.md §3.1
  "UNKNOWN",
] as const;

export type CanonicalProductCode = (typeof CANONICAL_PRODUCT_CODES)[number];

export interface ProductFlags {
  code: CanonicalProductCode;
  /** Produk lini KSB (Yacona, Teacona, Bio Insuleaf, Zymuno, Nutriflakes, Probiogel, Freshmag, dll). */
  isKsbProduct: boolean;
  /** Dipakai untuk is_book_entry (Cluster C-Prodig/D): Ebook ATAU Buku Menuju Remisi. */
  isBookEntry: boolean;
  /** Ebook murni (bukan buku cetak) — dipakai untuk EBOOK_ONLY order category. */
  isEbook: boolean;
  /** Herbal Probetes / Sereal Amandia / Amandia Muesli — dipakai C-HP, Dhp. */
  isHpOrAmandia: boolean;
  /** Daftar produk konversi Cluster E (docs/02-CLUSTER-RULES.md §4). */
  isTargetPhysical: boolean;
}

export function productFlagsForCode(code: CanonicalProductCode): ProductFlags {
  const isKsbProduct = code === "YACONA";
  const isEbook = code === "EBOOK";
  const isBookEntry = code === "EBOOK" || code === "BUKU_MENUJU_REMISI";
  const isHpOrAmandia =
    code === "HERBAL_PROBETES" || code === "SEREAL_AMANDIA" || code === "AMANDIA_MUESLI";
  const isTargetPhysical =
    isHpOrAmandia ||
    code === "PROBETES_OIL" ||
    code === "BERAS" ||
    code === "MINYAK_CCO" ||
    code === "MINYAK_KELAPA" ||
    code === "MINYAK_VCO" ||
    code === "STEVIA";
  return { code, isKsbProduct, isBookEntry, isEbook, isHpOrAmandia, isTargetPhysical };
}

/** Strip prefix varian "S " / "Tk " dan suffix " BONUS" — sudah cukup memangkas
 * mayoritas 132 varian mentah jadi nama dasar yang sama (lihat 06-DATA-FINDINGS §8). */
export function canonicalizeForMatching(raw: unknown): string {
  const cleaned = cleanText(raw).toUpperCase();
  const noPrefix = cleaned.replace(/^(S|TK)\s+/, "");
  return noPrefix.replace(/\s+BONUS$/, "").trim();
}

/** Alias eksplisit — nama yang TIDAK bisa ditebak dari keyword generik. */
export const EXPLICIT_PRODUCT_ALIASES: Readonly<Record<string, CanonicalProductCode>> = {
  // Herbal Probetes
  "HP": "HERBAL_PROBETES",
  "HP COD": "HERBAL_PROBETES",
  "PBH 70": "HERBAL_PROBETES",
  "PRO HERBAL DUMMY": "HERBAL_PROBETES",
  "PRO HERBAL 24": "HERBAL_PROBETES",
  "PROBETES HERBAL": "HERBAL_PROBETES",
  "PROBETES HERBAL 24": "HERBAL_PROBETES",
  "PROBETES HERBAL 20": "HERBAL_PROBETES",
  "HERBAL PROBETES": "HERBAL_PROBETES",
  "HERBAL PROBETES 24": "HERBAL_PROBETES",
  "HERBAL PROBETES 20": "HERBAL_PROBETES",

  // Sereal Amandia (Q7: varian angka = Sereal Amandia)
  "AMANDIA 10": "SEREAL_AMANDIA",
  "AMANDIA10": "SEREAL_AMANDIA",
  "AMANDIA 7": "SEREAL_AMANDIA",
  "AMANDIA 5": "SEREAL_AMANDIA",

  // Amandia Muesli
  "AMANDIA MUESLI": "AMANDIA_MUESLI",
  "AMANDIA MUSELI": "AMANDIA_MUESLI", // typo di data

  // Beras
  "BERAS ORGANIK": "BERAS",
  "BERAS": "BERAS",
  "BERAS MERAH": "BERAS",

  // Buku
  "BUKU REMISI": "BUKU_MENUJU_REMISI",
  "BUKU KURUS": "BUKU_KURUS",

  // Probetes Oil
  "PROBETES OIL": "PROBETES_OIL",

  // Stevia
  "STEVIA": "STEVIA",
  "GULA STEVIA": "STEVIA",

  // KSB — lini bisnis terpisah (docs/02-CLUSTER-RULES.md §3.1), tapi kadang
  // nyasar di Database All. Tetap diberi flag is_ksb_product=true supaya terfilter
  // dari RFM/Frequency Probetes.
  "YACONA 60": "YACONA",
  "YACONA": "YACONA",
  "TEACONA 20": "YACONA",
  "TEACONA": "YACONA",
  "BIO INSULEAF": "YACONA",
  "ETAWALIN": "YACONA",
  "ETAWAKU": "YACONA",
  "NUTRIFLAKES": "YACONA",
  "ZYMUNO": "YACONA",
  "PROBIOGEL": "YACONA",
  "FRESHMAG": "YACONA",
};

/** Fallback keyword-based, meniru heuristik sistem lama (README legacy §8 FAQ:
 * "keyword matching bukan dropdown ... supaya varian nama produk otomatis
 * terdeteksi selama mengandung kata kunci yang relevan"). */
function classifyByKeyword(name: string): CanonicalProductCode | null {
  if (name.includes("EBOOK") || name.includes("AUDIOBOOK")) return "EBOOK";
  if (name.includes("CCO")) return "MINYAK_CCO";
  if (name.includes("VCO")) return "MINYAK_VCO";
  if (name.includes("MINYAK")) return "MINYAK_KELAPA";
  return null;
}

export function classifyProduct(rawProductName: unknown): ProductFlags {
  const name = canonicalizeForMatching(rawProductName);
  if (name === "") return productFlagsForCode("UNKNOWN");

  const explicit = EXPLICIT_PRODUCT_ALIASES[name];
  if (explicit) return productFlagsForCode(explicit);

  const byKeyword = classifyByKeyword(name);
  if (byKeyword) return productFlagsForCode(byKeyword);

  return productFlagsForCode("UNKNOWN");
}
