import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Database, FileSpreadsheet } from "lucide-react";
import { loadDashboardSummary } from "@/app/analytics-actions";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CustomerTrendChart, FrequencyBarChart, RevenueTrendChart } from "@/components/charts/lazy-charts";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { FadeInItem, FadeInStagger } from "@/components/motion/fade-in";
import { cn } from "@/lib/utils";
import type { ActiveSourceSummary } from "@/lib/dataset-types";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Filter tanggal di Dashboard sengaja DISPLAY-ONLY dan HANYA memengaruhi "Nilai
 * order" + trend bulanan (riwayat penjualan per periode) — lihat catatan di
 * getDashboardSummary (src/server/analytics/queries.ts). Eligible customers,
 * Avg frequency, Avg monetary tetap dihitung dari seluruh histori: itu angka
 * RFM/cluster yang dilindungi (docs/07-OPEN-QUESTIONS.md Q16), sama seperti
 * halaman Cohort/Frequency/RFM/Cluster yang tidak punya filter tanggal sama sekali.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const dateFrom = first(params.from);
  const dateTo = first(params.to);
  const filterActive = Boolean(dateFrom);

  let summary;
  try {
    summary = await loadDashboardSummary({ dateFrom, dateTo });
  } catch (error) {
    console.error("Dashboard gagal dimuat", error);
    return (
      <AppShell title="Dashboard">
        <Card>
          <CardHeader><CardTitle>Data belum tersedia</CardTitle><CardDescription>Belum ada dataset aktif, atau koneksi database gagal.</CardDescription></CardHeader>
        </Card>
      </AppShell>
    );
  }

  const periodLabel = filterActive
    ? `${formatDate(dateFrom)} – ${formatDate(dateTo ?? dateFrom)}`
    : "seluruh histori";

  const trendData = summary.monthlyTrend.map((row) => ({
    ...row,
    revenue: Number(row.revenue),
  }));
  const kpis = [
    { label: "Eligible customers", value: formatInteger(summary.eligibleCustomers), detail: "Customer dalam cluster resmi (bukan needs review) · seluruh histori" },
    { label: "Nilai order", value: formatRupiahShort(summary.totalOrderValue), detail: `Belum dikurangi retur · ${periodLabel}` },
    { label: "Avg. frequency", value: `${formatDecimal(summary.avgFrequency)}×`, detail: "Hari unik transaksi per customer · seluruh histori" },
    { label: "Avg. monetary", value: formatRupiah(BigInt(Math.round(summary.avgMonetary))), detail: "Nilai produk per customer · seluruh histori" },
  ];

  return (
    <AppShell title="Dashboard">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Riwayat penjualan (Nilai order &amp; tren bulanan): <span className="font-medium text-foreground">{periodLabel}</span>
            {filterActive ? <> · <Link href="/" className="text-primary hover:underline">reset</Link></> : null}
          </p>
          <DateRangeFilter />
        </div>

        <FadeInStagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="KPI utama">
          {kpis.map((kpi) => (
            <FadeInItem key={kpi.label}>
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{kpi.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{kpi.detail}</p>
                </CardContent>
              </Card>
            </FadeInItem>
          ))}
        </FadeInStagger>

        <section className="grid gap-4 xl:grid-cols-2" aria-label="Trend bulanan">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Monthly revenue trend</CardTitle>
              <CardDescription>Nilai produk per bulan · belum dikurangi retur · {periodLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              {trendData.length ? <RevenueTrendChart data={trendData} /> : <EmptyTrend />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Monthly active customer trend</CardTitle>
              <CardDescription>Customer unik yang bertransaksi per bulan · {periodLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              {trendData.length ? <CustomerTrendChart data={trendData} /> : <EmptyTrend />}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Frequency distribution</CardTitle>
              <CardDescription>Eksklusif · klik bar untuk daftar customer</CardDescription>
            </CardHeader>
            <CardContent>
              <FrequencyBarChart data={summary.frequencyDistribution} />
              <div className="mt-2 border-t pt-3 text-right">
                <Link href="/frequency" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  Lihat repeat purchase funnel <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Card>
              <CardHeader className="pb-3"><CardTitle>Data health</CardTitle><CardDescription>Batch Database All aktif</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {summary.dataHealth ? (
                  <>
                    <HealthRow icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} label="Valid source rows" value={formatInteger(summary.dataHealth.validRows)} />
                    <HealthRow icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} label="Excluded rows" value={formatInteger(summary.dataHealth.excludedRows)} />
                    <HealthRow icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} label="Unknown product rows" value={formatInteger(summary.dataHealth.unknownProductItems)} />
                    <HealthRow icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} label="Customers needs review" value={formatInteger(summary.dataHealth.needsReviewCustomers)} />
                    <Link href="/quality" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      Buka Data Quality <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </>
                ) : <p className="text-xs text-muted-foreground">Belum ada batch aktif.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle>Active sources</CardTitle><CardDescription>Status nyata tiap sumber, dibaca dari import_batches</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {summary.activeSources.map((source) => (
                  <SourceRow key={source.sourceType} source={source} />
                ))}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function EmptyTrend() {
  return <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">Tidak ada order pada periode ini.</p>;
}
function HealthRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 text-xs"><div className="flex items-center gap-2 text-muted-foreground">{icon}<span>{label}</span></div><span className="tabular font-semibold">{value}</span></div>;
}
/**
 * Satu baris sumber data. Semua isinya berasal dari DB (listActiveSources) —
 * tidak ada teks status yang di-hardcode. Sumber yang memang belum punya batch
 * aktif tampil sebagai "Belum ada batch aktif" karena `active:false` datang
 * dari query, bukan karena ditulis di komponen.
 */
function SourceRow({ source }: { source: ActiveSourceSummary }) {
  const detail = source.active
    ? [
        source.sourceRows !== null ? `${formatInteger(source.sourceRows)} baris sumber` : null,
        source.canonicalRows !== null
          ? `${formatInteger(source.canonicalRows)} ${source.canonicalLabel}`
          : null,
        source.asOfDate ? `as of ${formatDate(source.asOfDate)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Belum ada batch aktif";

  return (
    <div className={cn("flex items-center gap-3 rounded-md border p-3", !source.active && "border-dashed opacity-70")}>
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", source.active ? "bg-accent" : "bg-muted")}>
        <Database className={cn("h-4 w-4", source.active ? "text-primary" : "text-muted-foreground")} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-medium">{source.label}</p>
          {source.active ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Belum aktif</Badge>}
        </div>
        <p className="truncate text-[11px] text-muted-foreground" title={source.filename ?? undefined}>{detail}</p>
      </div>
      {source.active ? <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
    </div>
  );
}
function formatInteger(value: number) { return value.toLocaleString("id-ID"); }
function formatDecimal(value: number) { return value.toLocaleString("id-ID", { maximumFractionDigits: 1 }); }
function formatRupiah(value: bigint) { return `Rp ${value.toLocaleString("id-ID")}`; }
function formatRupiahShort(value: bigint) {
  if (value >= 1_000_000_000n) return `Rp ${(Number(value) / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  if (value >= 1_000_000n) return `Rp ${(Number(value) / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return formatRupiah(value);
}
function formatDate(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "—";
}
