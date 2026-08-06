import { loadWorkspaceProductsAction } from "@/app/workspace-master-data-actions";
import { AppShell } from "@/components/layout/app-shell";
import { Pagination } from "@/components/ui/pagination";
import { MasterDataFilterBar } from "@/components/workspace/master-data-filter-bar";
import { MasterDataManager } from "@/components/workspace/master-data-manager";
import { UnmappedProductsPanel } from "@/components/workspace/unmapped-products-panel";
import { requireCrmPermission } from "@/server/auth/guards";
import { workspaceProductFilterSchema } from "@/lib/workspace-master-data-contracts";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function WorkspaceMasterDataPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const defaults = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, first(value)])) as Record<string, string | undefined>;
  const filter = workspaceProductFilterSchema.parse(defaults);

  const [user, { rows, total }] = await Promise.all([
    requireCrmPermission("crm.product.read"),
    loadWorkspaceProductsAction(filter),
  ]);
  const canManage = user.role === "ADMIN";

  const hrefWith = (patch: Record<string, string>) => {
    const query = new URLSearchParams(defaults as Record<string, string>);
    for (const [key, value] of Object.entries(patch)) query.set(key, value);
    return `/workspace/master-data?${query.toString()}`;
  };
  const totalPages = Math.max(Math.ceil(total / filter.perPage), 1);
  const currentPage = Math.min(filter.page, totalPages);

  return (
    <AppShell title="Master Data">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Product ID, nama produk, harga jual, HPP, jenis produk, dan status — sumber tunggal yang dipakai combobox Pesanan.
        </p>
        <UnmappedProductsPanel canManage={canManage} />
        <MasterDataFilterBar defaults={defaults} />
        <MasterDataManager initialRows={rows} canManage={canManage} />
        <Pagination
          page={filter.page}
          perPage={filter.perPage}
          total={total}
          label="produk"
          prevHref={currentPage > 1 ? hrefWith({ page: String(currentPage - 1) }) : null}
          nextHref={currentPage < totalPages ? hrefWith({ page: String(currentPage + 1) }) : null}
          perPageHrefs={{ 25: hrefWith({ perPage: "25", page: "1" }), 50: hrefWith({ perPage: "50", page: "1" }), 100: hrefWith({ perPage: "100", page: "1" }) }}
        />
      </div>
    </AppShell>
  );
}
