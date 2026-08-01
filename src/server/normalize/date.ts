/**
 * Normalisasi tanggal ke YYYY-MM-DD, tanpa komponen jam.
 * Excel date adalah "hari kalender", bukan timestamp. SheetJS dengan `cellDates`
 * menghasilkan Date pada tengah malam timezone proses, jadi komponen kalender
 * Date dibaca secara lokal. Excel serial number tetap dihitung via epoch UTC.
 * Lihat docs/04-DESIGN.md §3.4.
 */

export type DateNormalizeResult =
  | { status: "VALID"; date: string } // YYYY-MM-DD
  | { status: "MISSING" }
  | { status: "INVALID"; raw: string };

// Excel epoch (hari ke-0), memperhitungkan bug tahun kabisat 1900 ala Excel/Lotus.
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

export function normalizeDate(raw: unknown): DateNormalizeResult {
  if (raw === null || raw === undefined || raw === "") return { status: "MISSING" };

  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return { status: "INVALID", raw: String(raw) };
    const ms = EXCEL_EPOCH_UTC_MS + Math.round(raw) * MS_PER_DAY;
    return { status: "VALID", date: toISODateUTC(new Date(ms)) };
  }

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return { status: "INVALID", raw: String(raw) };
    return { status: "VALID", date: toISODateLocal(raw) };
  }

  const s = String(raw).trim();
  if (s === "") return { status: "MISSING" };

  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return validateYMD(Number(y), Number(m), Number(d), s);
  }

  const isoLike = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoLike) {
    const [, y, m, d] = isoLike;
    return validateYMD(Number(y), Number(m), Number(d), s);
  }

  return { status: "INVALID", raw: s };
}

function validateYMD(y: number, m: number, d: number, raw: string): DateNormalizeResult {
  if (m < 1 || m > 12 || d < 1 || d > 31) return { status: "INVALID", raw };
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { status: "INVALID", raw };
  }
  return { status: "VALID", date: toISODateUTC(date) };
}

function toISODateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toISODateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYMD(date: string): { y: number; m: number; d: number } {
  const parts = date.split("-").map(Number);
  const y = parts[0] ?? NaN;
  const m = parts[1] ?? NaN;
  const d = parts[2] ?? NaN;
  return { y, m, d };
}

/** Selisih hari kalender antara dua tanggal YYYY-MM-DD (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = parseYMD(a);
  const pb = parseYMD(b);
  const msA = Date.UTC(pa.y, pa.m - 1, pa.d);
  const msB = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((msB - msA) / MS_PER_DAY);
}

export function yearMonthOf(date: string): { year: number; month: number } {
  const { y, m } = parseYMD(date);
  return { year: y, month: m };
}
