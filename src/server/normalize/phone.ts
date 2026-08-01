/**
 * Normalisasi nomor HP ke bentuk kanonik 628xxxxxxxxx.
 * Fungsi murni — tanpa I/O. Lihat docs/04-DESIGN.md §3.1.
 */

export type PhoneNormalizeResult =
  | { status: "VALID"; normalized: string }
  | { status: "MISSING" }
  | { status: "INVALID"; raw: string; reason: string };

const MIN_DIGITS = 10;
const MAX_DIGITS = 15;

export function normalizePhone(raw: unknown): PhoneNormalizeResult {
  if (raw === null || raw === undefined) return { status: "MISSING" };

  let s = String(raw).trim();
  if (s === "") return { status: "MISSING" };

  // Artefak Excel: nomor dibaca sebagai float → "6281234567890.0"
  if (s.endsWith(".0")) s = s.slice(0, -2);

  // Notasi ilmiah (mis. "8.12346E+11") — data sudah rusak, tidak bisa dipulihkan
  if (/e[+-]?\d+/i.test(s)) {
    return { status: "INVALID", raw: s, reason: "SCIENTIFIC_NOTATION" };
  }

  const digits = s.replace(/\D/g, "");
  if (digits === "") return { status: "MISSING" };

  let normalized: string;
  if (digits.startsWith("62")) {
    normalized = digits;
  } else if (digits.startsWith("0")) {
    normalized = "62" + digits.slice(1);
  } else if (digits.startsWith("8")) {
    normalized = "62" + digits;
  } else {
    return { status: "INVALID", raw: s, reason: "NOT_62_PREFIX" };
  }

  if (normalized.length < MIN_DIGITS || normalized.length > MAX_DIGITS) {
    return { status: "INVALID", raw: s, reason: `LENGTH_${normalized.length}` };
  }
  if (!normalized.startsWith("628")) {
    return { status: "INVALID", raw: s, reason: "NOT_628_PREFIX" };
  }

  return { status: "VALID", normalized };
}
