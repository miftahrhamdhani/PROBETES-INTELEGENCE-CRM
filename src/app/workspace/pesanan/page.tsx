import Link from "next/link";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadActiveCrmUsersAction, loadWorkspacePesananKpiAction, loadWorkspacePesananListAction } from "@/app/workspace-pesanan-actions";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { PesananFilterBar } from "@/components/workspace/pesanan-filter-bar";
import { PesananKpiGrid } from "@/components/workspace/pesanan-kpi-grid";
import { PesananManager } from "@/components/workspace/pesanan-manager";
import { requireCrmPermission } from "@/server/auth/guards";
import { workspaceOrderFilterSchema, type WorkspacePesananTab } from "@/lib/workspace-pesanan-contracts";
import { resolveDateRangePreset } from "@/lib/workspace-date-presets";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function WorkspacePesananPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const defaults = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, first(value)])) as Record<string, string | undefined>;

  // Default periode: Hari Ini (docs prompt §6).
  if (!defaults.from && !defaults.to) {
    const today = resolveDateRangePreset("TODAY");
    defaults.from = today.from ?? undefined;
    defaults.to = today.to ?? undefined;
  }
  const filter = workspaceOrderFilterSchema.parse(defaults);
  const isKpiTab = filter.tab === "semua";
  const isReturRefundTab = filter.tab === "retur_refund";

  // KPI (Total Sales/AOV/COS/COM/dst.) hanya berarti untuk pesanan yang sudah
  // berhasil dikirim (CONFIRMED) — di tab Draft/Retur & Refund selalu nol
  // karena query KPI memaksa status=CONFIRMED, jadi tidak perlu dipanggil sama sekali.
  const [, { rows, total }, kpi, crmOptions] = await Promise.all([
    requireCrmPermission("crm.order.read"),
    loadWorkspacePesananListAction(filter),
    isKpiTab ? loadWorkspacePesananKpiAction(filter) : Promise.resolve(null),
    loadActiveCrmUsersAction(),
  ]);

  // Export memakai query yang SAMA persis dengan tabel (tanpa page/perPage,
  // karena export selalu meliputi seluruh hasil filter, bukan halaman aktif).
  const exportParams = new URLSearchParams(defaults as Record<string, string>);
  exportParams.delete("page");
  exportParams.delete("perPage");
  const exportQuery = exportParams.toString();

  const hrefWith = (patch: Record<string, string>) => {
    const params = new URLSearchParams(defaults as Record<string, string>);
    for (const [key, value] of Object.entries(patch)) params.set(key, value);
    return `/workspace/pesanan?${params.toString()}`;
  };
  // Ganti tab me-reset `status` (opsi dropdown-nya beda per tab — status
  // CONFIRMED yang terbawa dari tab Semua Pesanan akan membuat tab lain
  // selalu kosong) dan `page`.
  const tabHref = (tab: WorkspacePesananTab) => {
    const params = new URLSearchParams(defaults as Record<string, string>);
    params.delete("status");
    params.delete("page");
    params.set("tab", tab);
    return `/workspace/pesanan?${params.toString()}`;
  };
  const totalPages = Math.max(Math.ceil(total / filter.perPage), 1);
  const currentPage = Math.min(filter.page, totalPages);

  return (
    <AppShell title="Pesanan">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Input, pencarian, pengelolaan, dan laporan transaksi CRM.</p>
          {isReturRefundTab ? null : (
            <Button type="button" size="sm" className="gap-1.5" asChild>
              <Link href="/workspace/pesanan/baru"><Plus className="h-3.5 w-3.5" aria-hidden="true" />Input Pesanan</Link>
            </Button>
          )}
        </div>
        <div className="flex gap-1 border-b">
          <TabLink href={tabHref("semua")} active={isKpiTab}>Semua Pesanan</TabLink>
          <TabLink href={tabHref("draft")} active={filter.tab === "draft"}>Draft Pesanan</TabLink>
          <TabLink href={tabHref("retur_refund")} active={isReturRefundTab}>Retur &amp; Refund</TabLink>
        </div>
        <PesananFilterBar defaults={defaults} crmOptions={crmOptions} tab={filter.tab} />
        {kpi ? <PesananKpiGrid kpi={kpi} /> : null}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {total === 0
              ? filter.tab === "draft"
                ? "Belum ada pesanan draft pada rentang ini."
                : isReturRefundTab
                  ? "Belum ada pesanan retur/refund pada rentang ini."
                  : "Belum ada pesanan pada rentang ini."
              : `${total.toLocaleString("id-ID")} pesanan pada filter ini.`}
          </p>
          <div className="flex gap-1.5">
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={`/api/workspace/pesanan/export.csv?${exportQuery}`}>Export CSV</a>
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={`/api/workspace/pesanan/export.xlsx?${exportQuery}`}>Export Excel</a>
            </Button>
          </div>
        </div>
        <PesananManager rows={rows} tab={filter.tab} />
        <Pagination
          page={filter.page}
          perPage={filter.perPage}
          total={total}
          label="pesanan"
          prevHref={currentPage > 1 ? hrefWith({ page: String(currentPage - 1) }) : null}
          nextHref={currentPage < totalPages ? hrefWith({ page: String(currentPage + 1) }) : null}
          perPageHrefs={{ 25: hrefWith({ perPage: "25", page: "1" }), 50: hrefWith({ perPage: "50", page: "1" }), 100: hrefWith({ perPage: "100", page: "1" }) }}
        />
      </div>
    </AppShell>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
