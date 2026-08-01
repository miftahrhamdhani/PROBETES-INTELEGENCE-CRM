import Link from "next/link";
import type { RetentionRow } from "@/lib/analytics-types";
import { cn } from "@/lib/utils";

export function RetentionTable({ rows, maxMonth }: { rows: readonly RetentionRow[]; maxMonth: number }) {
  const months = Array.from({ length: maxMonth + 1 }, (_, index) => index);

  return (
    <div className="scrollbar-thin overflow-x-auto rounded-lg border">
      <table className="min-w-max border-collapse text-xs" aria-label="Legacy retention M0 sampai M24">
        <thead>
          <tr className="bg-muted/70">
            <Header sticky>First order</Header>
            <Header numeric>Total sales</Header>
            <Header numeric>New customers</Header>
            <Header numeric>Retained revenue</Header>
            <Header numeric>Avg. retention</Header>
            <Header numeric>Retention ratio</Header>
            {months.map((month) => <Header key={month} numeric>{`M${month}`}</Header>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.cohort}>
              <th className="sticky left-0 z-10 border-b border-r bg-card px-3 py-2 text-left font-medium tabular">
                <Link href={`/customers?cohortMonth=${row.cohort}`} className="hover:underline">
                  {row.cohort}
                </Link>
              </th>
              <Cell>{formatRupiah(row.totalSales)}</Cell>
              <Cell>{formatInteger(row.newCustomers)}</Cell>
              <Cell>{formatRupiah(row.retainedRevenue)}</Cell>
              <Cell>{formatPercent(row.averageRetention)}</Cell>
              <Cell>{formatPercent(row.retentionRatio)}</Cell>
              {months.map((month) => {
                const cell = row.months[month];
                if (!cell) return <td key={month} className="border-b border-r bg-muted/20 px-3 py-2 text-center text-muted-foreground">—</td>;
                return (
                  <td key={month} className="border-b border-r p-0 last:border-r-0">
                    <Link
                      href={`/customers?cohortMonth=${row.cohort}&activeMonthIndex=${month}`}
                      title={`${row.cohort} · M${month} · ${formatPercent(cell.ratio)} · ${formatInteger(cell.users)} customer · ${formatRupiah(cell.revenue)}${cell.partial ? " · PARTIAL" : ""}`}
                      aria-label={`${row.cohort}, bulan ${month}, ${formatPercent(cell.ratio)}, ${formatInteger(cell.users)} customer${cell.partial ? ", partial" : ""}`}
                      className={cn(
                        "flex min-h-14 min-w-24 flex-col items-center justify-center px-2 py-1 tabular transition-[filter,transform] duration-150 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        cell.partial && "bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,var(--heat-stripe)_5px,var(--heat-stripe)_10px)]"
                      )}
                      style={{ backgroundColor: heatColor(cell.ratio), color: cell.ratio >= 38 ? "var(--heat-ink-light)" : "var(--heat-ink-dark)" }}
                    >
                      <span className="font-semibold">{formatPercent(cell.ratio)}</span>
                      <span className="text-[9px] opacity-75">{formatInteger(cell.users)} cust.</span>
                      {cell.partial && <span className="text-[9px] font-semibold">PARTIAL</span>}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Header({ children, numeric = false, sticky = false }: { children: React.ReactNode; numeric?: boolean; sticky?: boolean }) {
  return <th className={cn("min-w-28 border-b border-r px-3 py-2 font-semibold", numeric ? "text-right" : "text-left", sticky && "sticky left-0 z-20 bg-muted")}>{children}</th>;
}
function Cell({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-r px-3 py-2 text-right tabular">{children}</td>;
}
function formatRupiah(value: bigint) { return `Rp ${value.toLocaleString("id-ID")}`; }
function formatInteger(value: number) { return value.toLocaleString("id-ID"); }
function formatPercent(value: number) { return `${value.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`; }
function heatColor(percent: number) {
  if (percent >= 80) return "var(--heat-700)";
  if (percent >= 45) return "var(--heat-600)";
  if (percent >= 25) return "var(--heat-500)";
  if (percent >= 15) return "var(--heat-400)";
  if (percent >= 8) return "var(--heat-300)";
  if (percent >= 3) return "var(--heat-200)";
  return "var(--heat-100)";
}
