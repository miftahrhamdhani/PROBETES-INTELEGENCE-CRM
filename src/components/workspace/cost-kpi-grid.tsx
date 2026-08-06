import { Card, CardContent } from "@/components/ui/card";
import type { WorkspaceCostKpi } from "@/lib/workspace-cost-contracts";
import { formatRupiah } from "@/lib/format";

export function CostKpiGrid({ kpi }: { kpi: WorkspaceCostKpi }) {
  const cards = [
    { label: "Total COM Approved", value: formatRupiah(kpi.totalApproved) },
    { label: "COM Broadcast", value: formatRupiah(kpi.comBroadcast) },
    { label: "COM Software/Tools", value: formatRupiah(kpi.comSoftwareTools) },
    { label: "COM AI", value: formatRupiah(kpi.comAi) },
    { label: "Menunggu Persetujuan", value: kpi.pendingApproval.toLocaleString("id-ID") },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-lg font-semibold tabular">{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
