import Link from "next/link";
import { loadRfmAnalytics } from "@/app/analytics-actions";
import { AppShell } from "@/components/layout/app-shell";
import { FrequencyBarChart } from "@/components/charts/lazy-charts";
import { RfmBarChart } from "@/components/charts/lazy-charts";
import { FadeInItem, FadeInStagger } from "@/components/motion/fade-in";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RECENCY_BUCKETS, RFM_FREQUENCY_BUCKETS } from "@/lib/analytics-types";

export const dynamic = "force-dynamic";

export default async function RfmPage() {
  let analytics;
  try {
    analytics = await loadRfmAnalytics();
  } catch (error) {
    console.error("RFM analytics gagal dimuat", error);
    return (
      <AppShell title="RFM Analysis">
        <Card>
          <CardHeader>
            <CardTitle>Analytics belum tersedia</CardTitle>
            <CardDescription>Belum ada dataset aktif, atau koneksi database gagal.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  const frequency = RFM_FREQUENCY_BUCKETS.map((bucket, index) => ({
    bucket,
    customers: analytics.heatmap.reduce((sum, row) => sum + (row[index] ?? 0), 0),
  }));

  return (
    <AppShell title="RFM Analysis">
      <div className="space-y-4">
        <FadeInStagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FadeInItem><Metric label="Eligible customers" value={formatInteger(analytics.eligibleCustomers)} /></FadeInItem>
          <FadeInItem><Metric label="Avg. recency" value={`${formatDecimal(analytics.avgRecencyDays)} hari`} /></FadeInItem>
          <FadeInItem><Metric label="Avg. frequency" value={`${formatDecimal(analytics.avgFrequency)}×`} /></FadeInItem>
          <FadeInItem><Metric label="Avg. monetary" value={formatRupiah(analytics.avgMonetary)} /></FadeInItem>
        </FadeInStagger>

        <section className="grid gap-4 xl:grid-cols-3">
          <ChartCard title="Recency distribution" desc="Klik bar untuk daftar customer">
            <RfmBarChart kind="recency" data={analytics.recencyDistribution} />
          </ChartCard>
          <ChartCard title="Frequency distribution" desc="Klik bar untuk daftar customer">
            <FrequencyBarChart data={frequency} />
          </ChartCard>
          <ChartCard title="Monetary distribution" desc="Klik bar untuk daftar customer">
            <RfmBarChart kind="monetary" data={analytics.monetaryDistribution} />
          </ChartCard>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>R × F heatmap</CardTitle>
            <CardDescription>
              Data nyata per {formatDate(analytics.asOfDate)} · analisis distribusi, bukan penentu Cluster A1–F · klik sel untuk daftar customer
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[620px] text-xs">
                <thead>
                  <tr className="bg-muted/70">
                    <th className="px-3 py-2 text-left">Recency</th>
                    {RFM_FREQUENCY_BUCKETS.map((bucket) => (
                      <th key={bucket} className="px-3 py-2 text-center">{bucket}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics.heatmap.map((values, rowIndex) => {
                    const recency = RECENCY_BUCKETS[rowIndex];
                    if (!recency) return null;
                    return (
                      <tr key={recency.label} className="border-t">
                        <th className="px-3 py-2 text-left font-medium">{recency.label} hari</th>
                        {values.map((customers, columnIndex) => {
                          const frequencyBucket = RFM_FREQUENCY_BUCKETS[columnIndex];
                          if (!frequencyBucket) return null;
                          return (
                            <td key={frequencyBucket} className="border-l p-0">
                              <Link
                                href={heatmapHref(recency.min, recency.max, frequencyBucket)}
                                className="flex min-h-12 w-full items-center justify-center px-3 py-2 font-semibold tabular transition-[filter,transform] duration-150 hover:brightness-95 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                style={{ backgroundColor: heat(customers), color: customers > 2_000 ? "white" : "hsl(var(--foreground))" }}
                                title={`${recency.label} hari · ${frequencyBucket} · ${formatInteger(customers)} customers`}
                              >
                                {formatInteger(customers)}
                              </Link>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function heatmapHref(recencyMin: number, recencyMax: number | null, frequency: string) {
  const params = new URLSearchParams({ recencyMin: String(recencyMin) });
  if (recencyMax !== null) params.set("recencyMax", String(recencyMax));
  if (frequency === "F5+") params.set("frequencyMin", "5");
  else params.set("frequency", frequency.slice(1));
  return `/customers?${params.toString()}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
function ChartCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return <Card><CardHeader className="pb-2"><CardTitle>{title}</CardTitle><CardDescription>{desc}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card>;
}
function formatInteger(value: number) { return value.toLocaleString("id-ID"); }
function formatDecimal(value: number) { return value.toLocaleString("id-ID", { maximumFractionDigits: 1 }); }
function formatRupiah(value: number) { return `Rp ${Math.round(value).toLocaleString("id-ID")}`; }
function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
    : "—";
}
function heat(value: number) {
  if (value > 3_000) return "var(--heat-700)";
  if (value > 1_500) return "var(--heat-600)";
  if (value > 700) return "var(--heat-400)";
  if (value > 200) return "var(--heat-300)";
  return "var(--heat-100)";
}
