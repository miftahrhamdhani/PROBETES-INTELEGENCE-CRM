import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { loadWorkspaceProductKpiAction, loadWorkspaceProductsAction } from "@/app/workspace-master-data-actions";
import { AppShell } from "@/components/layout/app-shell";
import { Pagination } from "@/components/ui/pagination";
import { MasterProductClient } from "@/components/workspace/master-product-client";
import { MasterProductKpiGrid } from "@/components/workspace/master-product-kpi-grid";
import { UnmappedProductsPanel } from "@/components/workspace/unmapped-products-panel";
import { workspaceProductFilterSchema } from "@/lib/workspace-master-data-contracts";
import { roleHasCrmPermission } from "@/lib/crm-permissions";
import { requireCrmPermission } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Master Produk" };
type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function WorkspaceMasterProductPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const defaults = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, first(value)])) as Record<string, string | undefined>;
  const filter = workspaceProductFilterSchema.parse(defaults);
  const [user, list, kpi] = await Promise.all([
    requireCrmPermission("crm.product.read"),
    loadWorkspaceProductsAction(filter),
    loadWorkspaceProductKpiAction(),
  ]);
  const permissions = {
    create: roleHasCrmPermission(user.role, "crm.product.create"),
    update: roleHasCrmPermission(user.role, "crm.product.update"),
    deactivate: roleHasCrmPermission(user.role, "crm.product.deactivate"),
    alias: roleHasCrmPermission(user.role, "crm.product.alias.manage"),
    audit: roleHasCrmPermission(user.role, "crm.product.audit.read"),
    export: roleHasCrmPermission(user.role, "crm.product.export"),
  };
  const totalPages = Math.max(Math.ceil(list.total / filter.perPage), 1);
  const currentPage = Math.min(filter.page, totalPages);
  const hrefWith = (patch: Record<string, string>) => {
    const query = new URLSearchParams(defaults as Record<string, string>);
    Object.entries(patch).forEach(([key, value]) => query.set(key, value));
    return `/workspace/master-produk?${query}`;
  };

  return (
    <AppShell
      title="Master Produk"
      prominentTitle
      breadcrumb={
        <nav className="flex items-center gap-1 text-[11px] text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/workspace/overview" className="hover:text-foreground">Workspace CRM</Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span>Master Produk</span>
        </nav>
      }
    >
      <div className="space-y-4">
        <p className="-mt-3 max-w-3xl text-sm text-muted-foreground">
          Product ID, nama produk, harga jual, HPP, jenis produk, dan status — sumber tunggal yang digunakan pada input Pesanan.
        </p>
        <MasterProductKpiGrid kpi={kpi} />
        <UnmappedProductsPanel canManage={permissions.alias} />
        <MasterProductClient rows={list.rows} total={list.total} page={currentPage} perPage={filter.perPage} permissions={permissions} />
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Pagination
            page={currentPage}
            perPage={filter.perPage}
            total={list.total}
            label="produk"
            prevHref={currentPage > 1 ? hrefWith({ page: String(currentPage - 1) }) : null}
            nextHref={currentPage < totalPages ? hrefWith({ page: String(currentPage + 1) }) : null}
            perPageHrefs={{ 10: hrefWith({ perPage: "10", page: "1" }), 25: hrefWith({ perPage: "25", page: "1" }), 50: hrefWith({ perPage: "50", page: "1" }), 100: hrefWith({ perPage: "100", page: "1" }) }}
          />
        </div>
      </div>
    </AppShell>
  );
}
