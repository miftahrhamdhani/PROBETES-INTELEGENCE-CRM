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
