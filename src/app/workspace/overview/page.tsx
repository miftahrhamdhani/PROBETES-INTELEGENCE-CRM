import { loadWorkspaceOverviewAction } from "@/app/workspace-overview-actions";
import { AppShell } from "@/components/layout/app-shell";
import { OverviewFilterBar } from "@/components/workspace/overview-filter-bar";
import { OverviewKpiGrid } from "@/components/workspace/overview-kpi-grid";
import { PesananOverviewChartsLazy } from "@/components/workspace/pesanan-overview-charts-lazy";
import { requireCrmPermission } from "@/server/auth/guards";
import { resolveDateRangePreset } from "@/lib/workspace-date-presets";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function WorkspaceOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const defaults = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, first(value)])) as Record<string, string | undefined>;

  // Default periode Overview: Bulan Ini (spec tidak menetapkan default eksplisit untuk Overview,
  // beda dengan Pesanan yang eksplisit "Hari Ini" — Bulan Ini paling relevan untuk ringkasan bisnis).
  if (!defaults.from && !defaults.to) {
    const thisMonth = resolveDateRangePreset("THIS_MONTH");
    defaults.from = thisMonth.from ?? undefined;
    defaults.to = thisMonth.to ?? undefined;
  }

  // Guard halaman dan pemuatan data berjalan paralel: keduanya memverifikasi
  // permission yang sama (action punya guard-nya sendiri, tetap dipertahankan
  // sebagai defense in depth), jadi menunggu guard selesai dulu hanya menambah
  // satu round trip serial tanpa menambah keamanan apa pun.
  const [, overview] = await Promise.all([
    requireCrmPermission("crm.workspace.overview.read"),
    loadWorkspaceOverviewAction({ from: defaults.from, to: defaults.to }),
  ]);

  const comQuery = new URLSearchParams({ ...(defaults.from ? { from: defaults.from } : {}), ...(defaults.to ? { to: defaults.to } : {}) }).toString();

  return (
    <AppShell title="Overview">
      <div className="space-y-4">
        <OverviewFilterBar defaults={defaults} />
        <OverviewKpiGrid kpi={overview.kpi} comHref={`/workspace/biaya-operasional?${comQuery}`} />
        <PesananOverviewChartsLazy
          trend={overview.trend}
          productsByQuantity={overview.productsByQuantity}
          productsByRevenue={overview.productsByRevenue}
          productsByCos={overview.productsByCos}
          paymentComposition={overview.paymentComposition}
          customerSummary={overview.customerSummary}
        />
      </div>
    </AppShell>
  );
}
