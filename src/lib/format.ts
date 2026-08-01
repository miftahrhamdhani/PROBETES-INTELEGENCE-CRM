/**
 * SHARED — formatter angka/tanggal untuk tampilan. Tanpa I/O, tanpa React.
 * Satu sumber supaya format tanggal (DD MMM YYYY) konsisten di seluruh halaman.
 */

const DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Input: 'YYYY-MM-DD' (date SQL, tanpa jam). Output: '26 Jul 2026'. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return DATE_FORMATTER.format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

export function formatInteger(value: number): string {
  return value.toLocaleString("id-ID");
}

export function formatDecimal(value: number, maximumFractionDigits = 1): string {
  return value.toLocaleString("id-ID", { maximumFractionDigits });
}

export function formatPercent(value: number, maximumFractionDigits = 1): string {
  return `${value.toLocaleString("id-ID", { maximumFractionDigits })}%`;
}

export function formatRupiah(value: string | bigint | number | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "bigint" ? value : BigInt(Math.trunc(Number(value)));
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export function formatRupiahShort(value: bigint | number): string {
  const num = typeof value === "bigint" ? value : BigInt(Math.trunc(value));
  const abs = num < 0n ? -num : num;
  if (abs >= 1_000_000_000n) return `Rp ${(Number(num) / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (abs >= 1_000_000n) return `Rp ${(Number(num) / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return `Rp ${num.toLocaleString("id-ID")}`;
}
