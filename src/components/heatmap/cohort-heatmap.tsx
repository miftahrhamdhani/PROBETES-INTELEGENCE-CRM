import { cn } from "@/lib/utils";

interface HeatmapRow {
  cohort: string;
  size: number;
  values: readonly number[];
}

export function CohortHeatmap({
  rows,
  mode,
}: {
  rows: readonly HeatmapRow[];
  mode: "retention" | "funnel";
}) {
  const maxColumns = Math.max(...rows.map((row) => row.values.length));
  const columns = Array.from({ length: maxColumns }, (_, index) =>
    mode === "retention" ? `M${index}` : `F${index + 1}`
  );

  return (
    <div className="scrollbar-thin overflow-x-auto rounded-lg border">
      <table className="min-w-full border-collapse text-xs" aria-label={mode === "retention" ? "Cohort retention matrix" : "Repeat purchase funnel matrix"}>
        <thead>
          <tr className="bg-muted/70">
            <th className="sticky left-0 z-10 min-w-28 border-b border-r bg-muted px-3 py-2 text-left font-semibold">Cohort</th>
            <th className="min-w-20 border-b border-r px-3 py-2 text-right font-semibold">Size</th>
            {columns.map((column) => <th key={column} className="min-w-20 border-b border-r px-3 py-2 text-center font-semibold last:border-r-0">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.cohort}>
              <th className="sticky left-0 z-10 border-b border-r bg-card px-3 py-2 text-left font-medium tabular">{row.cohort}</th>
              <td className="border-b border-r px-3 py-2 text-right font-medium tabular">{row.size.toLocaleString("id-ID")}</td>
              {columns.map((_, index) => {
                const value = row.values[index];
                const partial = rowIndex === rows.length - 1 && index === row.values.length - 1;
                if (value === undefined) return <td key={index} className="border-b border-r bg-muted/20 px-2 py-2 text-center text-muted-foreground last:border-r-0">—</td>;
                const percent = mode === "retention" ? value : (value / row.size) * 100;
                return (
                  <td key={index} className="border-b border-r p-0 last:border-r-0">
                    <button
                      type="button"
                      title={`${row.cohort} · ${mode === "retention" ? `M${index}` : `F${index + 1}`} · ${mode === "retention" ? `${value.toFixed(1)}%` : `${value.toLocaleString("id-ID")} customer`}`}
                      className={cn("flex min-h-12 w-full flex-col items-center justify-center px-2 py-1 tabular transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", partial && "bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,var(--heat-stripe)_5px,var(--heat-stripe)_10px)]")}
                      style={{ backgroundColor: heatColor(percent), color: percent >= 38 ? "var(--heat-ink-light)" : "var(--heat-ink-dark)" }}
                      aria-label={`${row.cohort}, ${mode === "retention" ? `bulan ${index}` : `mencapai order ${index + 1}`}, ${mode === "retention" ? `${value.toFixed(1)} persen` : `${value} customer`}${partial ? ", partial" : ""}`}
                    >
                      <span className="font-semibold">{mode === "retention" ? `${value.toFixed(value === 100 ? 0 : 1)}%` : value.toLocaleString("id-ID")}</span>
                      <span className="text-[9px] opacity-75">{partial ? "PARTIAL" : mode === "retention" ? `${Math.round((row.size * value) / 100).toLocaleString("id-ID")} cust.` : `${percent.toFixed(1)}%`}</span>
                    </button>
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

function heatColor(percent: number): string {
  if (percent >= 80) return "var(--heat-700)";
  if (percent >= 45) return "var(--heat-600)";
  if (percent >= 25) return "var(--heat-500)";
  if (percent >= 15) return "var(--heat-400)";
  if (percent >= 8) return "var(--heat-300)";
  if (percent >= 3) return "var(--heat-200)";
  return "var(--heat-100)";
}
