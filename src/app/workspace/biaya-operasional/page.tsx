import { loadWorkspaceCostKpiAction, loadWorkspaceCostsAction } from "@/app/workspace-cost-actions";
import { AppShell } from "@/components/layout/app-shell";
import { Pagination } from "@/components/ui/pagination";
import { CostFilterBar } from "@/components/workspace/cost-filter-bar";
import { CostKpiGrid } from "@/components/workspace/cost-kpi-grid";
import { CostManager } from "@/components/workspace/cost-manager";
import { requireCrmPermission } from "@/server/auth/guards";
import { workspaceCostFilterSchema } from "@/lib/workspace-cost-contracts";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function WorkspaceBiayaOperasionalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const defaults = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, first(value)]));
  const filter = workspaceCostFilterSchema.parse(defaults);

  const [user, { rows, total }, kpi] = await Promise.all([
    requireCrmPermission("crm.com.read"),
    loadWorkspaceCostsAction(filter),
    loadWorkspaceCostKpiAction(filter),
  ]);

  const hrefWith = (patch: Record<string, string>) => {
    const params = new URLSearchParams(defaults as Record<string, string>);
    for (const [key, value] of Object.entries(patch)) params.set(key, value);
    return `/workspace/biaya-operasional?${params.toString()}`;
  };
  const totalPages = Math.max(Math.ceil(total / filter.perPage), 1);
  const currentPage = Math.min(filter.page, totalPages);

  return (
    <AppShell title="Biaya Operasional">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Pencatatan dan persetujuan biaya COM CRM (Mekari, AI, WhatsApp API, broadcast). Hanya biaya berstatus DIRECTOR_APPROVED yang masuk COM Overview/Pesanan.
        </p>
        <CostFilterBar defaults={defaults} />
        <CostKpiGrid kpi={kpi} />
        <CostManager initialRows={rows} currentUser={{ id: Number(user.id), name: user.name, role: user.role }} />
        <Pagination
          page={filter.page}
          perPage={filter.perPage}
          total={total}
          label="biaya"
          prevHref={currentPage > 1 ? hrefWith({ page: String(currentPage - 1) }) : null}
          nextHref={currentPage < totalPages ? hrefWith({ page: String(currentPage + 1) }) : null}
          perPageHrefs={{ 25: hrefWith({ perPage: "25", page: "1" }), 50: hrefWith({ perPage: "50", page: "1" }), 100: hrefWith({ perPage: "100", page: "1" }) }}
        />
      </div>
    </AppShell>
  );
}
