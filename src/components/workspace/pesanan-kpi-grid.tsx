import { Coins, PieChart, Receipt, TrendingUp, Users, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkspacePesananKpi } from "@/lib/workspace-pesanan-contracts";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 6 KPI Pesanan (docs prompt §4/§6.2 + AOV). COM & Pendapatan Bersih berubah
 *  makna saat filter Customer/CRM aktif — lihat `comIsGlobal`.
 *
 *  MURNI TAMPILAN: seluruh nilai datang apa adanya dari backend, tidak ada
 *  rumus yang dihitung ulang di sini. */
export function PesananKpiGrid({ kpi }: { kpi: WorkspacePesananKpi }) {
  return (
    <TooltipProvider>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard tone="blue" icon={Users} label="Jumlah Customer" value={kpi.jumlahCustomer.toLocaleString("id-ID")} />
        <KpiCard tone="green" icon={TrendingUp} label="Total Sales" value={formatRupiah(kpi.totalSales)} />
        <KpiCard
          tone="violet"
          icon={Wallet}
          label="AOV"
          value={formatRupiah(kpi.aov)}
          tooltip={`Total Sales ÷ ${kpi.jumlahPesanan.toLocaleString("id-ID")} pesanan CONFIRMED pada filter ini.`}
        />
        <KpiCard tone="orange" icon={PieChart} label="COS" value={formatRupiah(kpi.cos)} />
        <KpiCard
          tone="blue"
          icon={Receipt}
          label={kpi.comIsGlobal ? "COM Periode — Global" : "COM"}
          value={formatRupiah(kpi.com.value)}
          tooltip={kpi.comIsGlobal ? "COM belum dialokasikan per customer atau CRM." : undefined}
        />
        {kpi.comIsGlobal ? (
          <KpiCard
            tone="green"
            icon={Coins}
            label="Margin Sebelum COM"
            value={formatRupiah(kpi.marginSebelumCom ?? "0")}
            tooltip="Nilai Transaksi terfilter dikurangi COS terfilter — belum dikurangi COM."
          />
        ) : (
          <KpiCard
            tone="green"
            icon={Coins}
            label="Pendapatan Bersih"
            value={kpi.pendapatanBersih.available ? formatRupiah(kpi.pendapatanBersih.value) : "N/A"}
            tooltip={kpi.pendapatanBersih.label ?? undefined}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

const TONE: Record<"blue" | "green" | "violet" | "orange", string> = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300",
  green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300",
  orange: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300",
};

function KpiCard({
  label,
  value,
  tooltip,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  tooltip?: string;
  icon: typeof Users;
  tone: keyof typeof TONE;
}) {
  const card = (
    <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-800">
      <CardContent className="flex items-center gap-2.5 p-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", TONE[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-muted-foreground">{label}</p>
          <p className="mt-0.5 truncate text-base font-semibold tabular">{value}</p>
        </div>
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
