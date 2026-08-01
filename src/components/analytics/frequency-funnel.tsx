import Link from "next/link";
import type { FrequencyRow } from "@/lib/analytics-types";
import { cn } from "@/lib/utils";

export function FrequencyFunnel({ rows, maxOrder }: { rows: readonly FrequencyRow[]; maxOrder: number }) {
  const orders = Array.from({ length: maxOrder }, (_, index) => index + 1);

  return (
    <div className="scrollbar-thin overflow-x-auto rounded-lg border">
      <table className="min-w-max border-collapse text-xs" aria-label="Repeat purchase funnel dinamis">
        <thead>
          <tr className="bg-muted/70">
            <th className="sticky left-0 z-20 min-w-28 border-b border-r bg-muted px-3 py-2 text-left font-semibold">Cohort</th>
            <th className="min-w-24 border-b border-r px-3 py-2 text-right font-semibold">Size</th>
            {orders.map((order) => <th key={order} className="min-w-24 border-b border-r px-3 py-2 text-center font-semibold">{`F${order}`}</th>)}
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
              <td className="border-b border-r px-3 py-2 text-right font-medium tabular">{formatInteger(row.cohortSize)}</td>
              {orders.map((order) => {
                const cell = row.orders[order - 1];
                if (!cell) return <td key={order} className="border-b border-r bg-muted/20 px-3 py-2 text-center text-muted-foreground">—</td>;
                return (
                  <td key={order} className="border-b border-r p-0 last:border-r-0">
                    <Link
                      href={`/customers?cohortMonth=${row.cohort}&orderNumber=${order}`}
                      title={`${row.cohort} · mencapai F${order} · ${formatInteger(cell.users)} customer · ${formatPercent(cell.ratio)} · ${formatRupiah(cell.revenue)}`}
                      aria-label={`${row.cohort}, mencapai order ${order}, ${formatInteger(cell.users)} customer, ${formatPercent(cell.ratio)}`}
                      className={cn("flex min-h-14 w-full flex-col items-center justify-center px-2 py-1 tabular transition-[filter,transform] duration-150 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}
                      style={{ backgroundColor: heatColor(cell.ratio), color: cell.ratio >= 38 ? "var(--heat-ink-light)" : "var(--heat-ink-dark)" }}
                    >
                      <span className="font-semibold">{formatInteger(cell.users)}</span>
                      <span className="text-[9px] opacity-75">{formatPercent(cell.ratio)}</span>
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
