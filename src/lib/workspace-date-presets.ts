/** SHARED — preset rentang tanggal Workspace (docs prompt §6.1). Pure, tanpa I/O. */

export const DATE_RANGE_PRESETS = [
  "TODAY",
  "YESTERDAY",
  "LAST_7_DAYS",
  "LAST_30_DAYS",
  "THIS_WEEK",
  "THIS_MONTH",
  "LAST_MONTH",
  "THIS_YEAR",
  "ALL_TIME",
  "CUSTOM",
] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const DATE_RANGE_PRESET_LABEL: Record<DateRangePreset, string> = {
  TODAY: "Hari Ini",
  YESTERDAY: "Kemarin",
  LAST_7_DAYS: "7 Hari Terakhir",
  LAST_30_DAYS: "30 Hari Terakhir",
  THIS_WEEK: "Minggu Ini",
  THIS_MONTH: "Bulan Ini",
  LAST_MONTH: "Bulan Lalu",
  THIS_YEAR: "Tahun Ini",
  ALL_TIME: "Seluruh Data",
  CUSTOM: "Custom Range",
};

export function todayInJakarta(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function addDays(dateKey: string, delta: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export type DateRangeValue = { from: string | null; to: string | null };

/** ALL_TIME/CUSTOM mengembalikan {null,null} — "Seluruh Data" berarti tanpa
 *  filter tanggal (bukan tanpa batas ke data legacy — workspace_orders memang
 *  tidak pernah berisi data lama, lihat komentar schema.ts). */
export function resolveDateRangePreset(preset: DateRangePreset, now = new Date()): DateRangeValue {
  const today = todayInJakarta(now);
  switch (preset) {
    case "TODAY":
      return { from: today, to: today };
    case "YESTERDAY": {
      const yesterday = addDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "LAST_7_DAYS":
      return { from: addDays(today, -6), to: today };
    case "LAST_30_DAYS":
      return { from: addDays(today, -29), to: today };
    case "THIS_WEEK": {
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      return { from: addDays(today, mondayOffset), to: today };
    }
    case "THIS_MONTH":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "LAST_MONTH": {
      const firstOfThisMonth = `${today.slice(0, 7)}-01`;
      const lastMonthEnd = addDays(firstOfThisMonth, -1);
      return { from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd };
    }
    case "THIS_YEAR":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "ALL_TIME":
    case "CUSTOM":
      return { from: null, to: null };
  }
}
