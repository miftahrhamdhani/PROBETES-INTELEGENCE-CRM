import { loadWorkspaceOverviewAction } from "@/app/workspace-overview-actions";
import { AppShell } from "@/components/layout/app-shell";
import { OverviewFilterBar } from "@/components/workspace/overview-filter-bar";
import { OverviewDashboard } from "@/components/workspace/overview-dashboard";
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

  return (
    <AppShell title="Overview" hidePageHeader>
      <div className="-m-4 min-h-screen bg-slate-50/70 p-4 dark:bg-slate-950/30 xl:-m-6 xl:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Overview</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Ringkasan operasional &amp; keuangan CRM</p>
          </div>
          <OverviewFilterBar defaults={defaults} />
        </div>
        <OverviewDashboard data={overview} />
      </div>
    </AppShell>
  );
}
