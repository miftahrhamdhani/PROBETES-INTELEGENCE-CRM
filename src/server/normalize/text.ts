/** Normalisasi teks generik — trim, rapatkan spasi, ganti nbsp. Fungsi murni. */

export function cleanText(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  return String(raw)
    .replace(/ /g, " ") // non-breaking space -> spasi biasa
    .replace(/\s+/g, " ")
    .trim();
}

/** Untuk matching (CS, Mitra, Platform, Divisi) — bukan untuk display. */
export function normalizeForMatching(raw: unknown): string {
  return cleanText(raw).toUpperCase();
}
