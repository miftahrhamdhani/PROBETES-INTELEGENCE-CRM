import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkspacePesananKpi } from "@/lib/workspace-pesanan-contracts";
import { formatRupiah } from "@/lib/format";

/** 6 KPI Pesanan (docs prompt §4/§6.2 + AOV). COM & Pendapatan Bersih berubah
 *  makna saat filter Customer/CRM aktif — lihat `comIsGlobal`. */
export function PesananKpiGrid({ kpi }: { kpi: WorkspacePesananKpi }) {
  return (
    <TooltipProvider>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Jumlah Customer" value={kpi.jumlahCustomer.toLocaleString("id-ID")} />
        <KpiCard label="Total Sales" value={formatRupiah(kpi.totalSales)} />
        <KpiCard label="AOV" value={formatRupiah(kpi.aov)} tooltip={`Total Sales ÷ ${kpi.jumlahPesanan.toLocaleString("id-ID")} pesanan CONFIRMED pada filter ini.`} />
        <KpiCard label="COS" value={formatRupiah(kpi.cos)} />
        <KpiCard
          label={kpi.comIsGlobal ? "COM Periode — Global" : "COM"}
          value={formatRupiah(kpi.com.value)}
          tooltip={kpi.comIsGlobal ? "COM belum dialokasikan per customer atau CRM." : undefined}
        />
        {kpi.comIsGlobal ? (
          <KpiCard label="Margin Sebelum COM" value={formatRupiah(kpi.marginSebelumCom ?? "0")} tooltip="Nilai Transaksi terfilter dikurangi COS terfilter — belum dikurangi COM." />
        ) : (
          <KpiCard label="Pendapatan Bersih" value={kpi.pendapatanBersih.available ? formatRupiah(kpi.pendapatanBersih.value) : "N/A"} tooltip={kpi.pendapatanBersih.label ?? undefined} />
        )}
      </div>
    </TooltipProvider>
  );
}

function KpiCard({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  const card = (
    <Card>
      <CardContent className="p-3">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold tabular">{value}</p>
      </CardContent>
    </Card>
  );
  if (!tooltip) return card;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
