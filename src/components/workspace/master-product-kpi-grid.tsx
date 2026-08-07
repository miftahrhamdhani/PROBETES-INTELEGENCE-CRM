import { CircleOff, Gift, Layers3, Package, Tag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkspaceProductKpi } from "@/lib/workspace-master-data-contracts";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "total", label: "Total Produk", note: "Seluruh produk terdaftar", icon: Package, tone: "bg-violet-50 text-violet-600" },
  { key: "active", label: "Produk Aktif", note: "Siap digunakan", icon: Tag, tone: "bg-emerald-50 text-emerald-600" },
  { key: "inactive", label: "Produk Nonaktif", note: "Tidak aktif", icon: CircleOff, tone: "bg-amber-50 text-amber-600" },
  { key: "sellable", label: "Produk Sellable", note: "Dapat dijual", icon: Layers3, tone: "bg-sky-50 text-sky-600" },
  { key: "bonus", label: "Produk Bonus", note: "Dapat dijadikan bonus", icon: Gift, tone: "bg-purple-50 text-purple-600" },
] as const;

export function MasterProductKpiGrid({ kpi }: { kpi: WorkspaceProductKpi }) {
  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const card = (
            <Card className="flex min-h-[110px] items-center gap-4 rounded-xl border-slate-200 bg-white p-5 shadow-sm">
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", item.tone)}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <strong className="block text-2xl font-semibold tabular-nums text-slate-900">{kpi[item.key].toLocaleString("id-ID")}</strong>
                <span className="block text-xs font-semibold text-slate-700">{item.label}</span>
                <span className="block truncate text-[11px] text-slate-500">{item.note}</span>
              </span>
            </Card>
          );
          if (item.key !== "sellable" && item.key !== "bonus") return <div key={item.key}>{card}</div>;
          return (
            <Tooltip key={item.key}>
              <TooltipTrigger asChild><div>{card}</div></TooltipTrigger>
              <TooltipContent className="max-w-xs">Produk Sellable + Bonus dihitung pada kedua KPI karena dapat digunakan untuk penjualan maupun bonus.</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
