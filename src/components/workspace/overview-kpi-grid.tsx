import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { OverviewKpi } from "@/server/workspace/pesanan-overview";
import { formatRupiah } from "@/lib/format";

/** 6 KPI Overview (§7.1 + AOV). Kartu COM dapat diklik -> Biaya Operasional dengan from/to yang sama. */
export function OverviewKpiGrid({ kpi, comHref }: { kpi: OverviewKpi; comHref: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <KpiCard label="Jumlah Customer" value={kpi.jumlahCustomer.toLocaleString("id-ID")} />
      <KpiCard label="Total Sales" value={formatRupiah(kpi.totalSales)} />
      <KpiCard label="AOV" value={formatRupiah(kpi.aov)} />
      <KpiCard label="COS" value={formatRupiah(kpi.cos)} />
      <Link href={comHref}>
        <KpiCard label="COM" value={formatRupiah(kpi.com)} clickable />
      </Link>
      <KpiCard label="Pendapatan Bersih" value={formatRupiah(kpi.pendapatanBersih)} />
    </div>
  );
}

function KpiCard({ label, value, clickable }: { label: string; value: string; clickable?: boolean }) {
  return (
    <Card className={clickable ? "transition-colors hover:border-primary/50 hover:bg-accent/40" : undefined}>
      <CardContent className="p-3">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold tabular">{value}</p>
      </CardContent>
    </Card>
  );
}
