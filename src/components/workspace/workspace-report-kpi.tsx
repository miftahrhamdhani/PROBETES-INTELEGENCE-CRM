import { Card, CardContent } from "@/components/ui/card";
import { FadeInItem, FadeInStagger } from "@/components/motion/fade-in";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkspaceOverviewKpi } from "@/lib/workspace-types";

const toneClasses = {
  slate: "border-slate-400 bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50",
  green: "border-green-400 bg-green-100 dark:border-green-700 dark:bg-green-950/40",
  amber: "border-amber-400 bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40",
  red: "border-rose-400 bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40",
  teal: "border-teal-400 bg-teal-100 dark:border-teal-700 dark:bg-teal-950/40",
  violet: "border-violet-400 bg-violet-100 dark:border-violet-700 dark:bg-violet-950/40",
} as const;

/** KPI task tetap global; nilai laporan mengikuti filter aktif. */
export function WorkspaceReportKpiTiles({
  kpi,
  reportTotalValue,
}: {
  kpi: WorkspaceOverviewKpi;
  reportTotalValue: { count: number; totalPayment: string };
}) {
  const belumSelesai = kpi.unassigned + kpi.assigned + kpi.inProgress;
  const totalTugas = belumSelesai + kpi.done;

  const tiles: { key: string; label: string; value: string; tone: keyof typeof toneClasses }[] = [
    { key: "total", label: "Jumlah Tugas (Semua)", value: totalTugas.toLocaleString("id-ID"), tone: "slate" },
    { key: "done", label: "Selesai (Semua)", value: kpi.done.toLocaleString("id-ID"), tone: "green" },
    { key: "pending", label: "Belum Selesai (Semua)", value: belumSelesai.toLocaleString("id-ID"), tone: "amber" },
    { key: "overdue", label: "Overdue (Semua)", value: kpi.overdue.toLocaleString("id-ID"), tone: "red" },
    { key: "closing", label: "Closing (Semua)", value: kpi.closing.toLocaleString("id-ID"), tone: "teal" },
    { key: "joined", label: "Masuk Grup (Semua)", value: kpi.joinedGroup.toLocaleString("id-ID"), tone: "green" },
    {
      key: "value",
      label: `Nilai Laporan (${reportTotalValue.count.toLocaleString("id-ID")} laporan)`,
      value: formatRupiah(reportTotalValue.totalPayment),
      tone: "violet",
    },
  ];

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">KPI tugas berlingkup semua task; Nilai Laporan mengikuti filter aktif.</p>
      <FadeInStagger className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ringkasan Laporan Kerja">
        {tiles.map((tile) => (
          <FadeInItem key={tile.key}>
            <Card className={cn("h-full", toneClasses[tile.tone])}>
              <CardContent className="p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide">{tile.label}</p>
                <p className="mt-1 text-xl font-bold tabular">{tile.value}</p>
              </CardContent>
            </Card>
          </FadeInItem>
        ))}
      </FadeInStagger>
    </div>
  );
}
