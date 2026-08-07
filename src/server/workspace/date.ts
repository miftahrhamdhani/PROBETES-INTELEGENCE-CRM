import { sql, type SQL } from "drizzle-orm";
import { BUSINESS_TIME_ZONE } from "@/lib/crm-workspace-contracts";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function assertBusinessDate(value: string): string {
  if (!DATE_KEY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00+07:00`))) {
    throw new RangeError("Tanggal bisnis harus berformat YYYY-MM-DD");
  }
  return value;
}

export function nextBusinessDate(value: string): string {
  assertBusinessDate(value);
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function todayInJakarta(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function jakartaDateRange(from: string, to: string): { start: Date; endExclusive: Date } {
  assertBusinessDate(from);
  assertBusinessDate(to);
  if (from > to) throw new RangeError("Tanggal awal tidak boleh melewati tanggal akhir");
  return {
    start: new Date(`${from}T00:00:00+07:00`),
    endExclusive: new Date(`${nextBusinessDate(to)}T00:00:00+07:00`),
  };
}

/**
 * BUG-W04 — SATU-SATUNYA definisi "task overdue" di seluruh aplikasi.
 *
 * Sebelumnya kondisi ini ditulis ulang di 4 tempat (KPI Overview, ringkasan per
 * PIC, kolom overdue pada baris task, dan filter overdueOnly) dan semuanya
 * memakai `CURRENT_DATE` — tanggal menurut server database (UTC), bukan tanggal
 * bisnis WIB. Akibatnya batas overdue bergeser sampai ~7 jam, dan KPI bisa
 * berbeda dari hasil filter kalau keduanya dievaluasi di sisi jam yang berbeda.
 *
 * Sekarang tanggalnya dihitung SEKALI di aplikasi lewat todayInJakarta() lalu
 * dikirim sebagai parameter query (bukan interpolasi string). Aturan statusnya
 * TIDAK diubah: due_at terisi, sudah lewat, dan task belum DONE/CANCELLED.
 */
export function overdueCondition(alias = "t", today = todayInJakarta()): SQL {
  const dueAt = sql.raw(`${alias}.due_at`);
  const status = sql.raw(`${alias}.status`);
  return sql`(${dueAt} IS NOT NULL AND ${dueAt} < ${today}::date AND ${status} NOT IN ('DONE','CANCELLED'))`;
}
