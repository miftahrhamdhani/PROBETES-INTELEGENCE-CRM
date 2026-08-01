/**
 * Normalisasi nilai uang ke bigint rupiah.
 * ATURAN MUTLAK: uang selalu bigint, tidak pernah float (lihat CLAUDE.md).
 */

export function normalizeAmount(raw: unknown): bigint {
  if (raw === null || raw === undefined || raw === "") return 0n;

  if (typeof raw === "number") {
    return BigInt(Math.round(raw));
  }

  let s = String(raw).trim();
  if (s === "") return 0n;

  // Buang simbol mata uang & spasi: "Rp 1.500.000" -> "1.500.000"
  s = s.replace(/[^\d.,-]/g, "");
  if (s === "") return 0n;

  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);

  // Deteksi pemisah desimal vs ribuan.
  // Kalau ada 1 titik/koma di 3 digit terakhir DAN tidak ada titik/koma lain -> desimal.
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const lastSep = Math.max(lastDot, lastComma);

  let digitsOnly: string;
  if (lastSep === -1) {
    digitsOnly = s;
  } else {
    const fractionLen = s.length - lastSep - 1;
    const isDecimal = fractionLen <= 2 && (s.match(/[.,]/g) || []).length === 1;
    digitsOnly = isDecimal ? s.slice(0, lastSep) : s.replace(/[.,]/g, "");
  }

  digitsOnly = digitsOnly.replace(/\D/g, "");
  if (digitsOnly === "") return 0n;

  const value = BigInt(digitsOnly);
  return negative ? -value : value;
}

export function formatRupiah(amount: bigint | number): string {
  const n = typeof amount === "bigint" ? amount : BigInt(Math.round(amount));
  return "Rp " + n.toLocaleString("id-ID");
}
