import Link from "next/link";
import { loadFrequencyAnalytics } from "@/app/analytics-actions";
import { AppShell } from "@/components/layout/app-shell";
import { FrequencyBarChart } from "@/components/charts/overview-charts";
import { FrequencyFunnel } from "@/components/analytics/frequency-funnel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeInItem, FadeInStagger } from "@/components/motion/fade-in";

/** Bucket F1..F4 = frequency tepat sama; F5+ = frequency minimal 5. */
function bucketHref(bucket: string): string {
  if (bucket === "F5+") return "/customers?frequencyMin=5";
  return `/customers?frequency=${bucket.slice(1)}`;
}

export const dynamic = "force-dynamic";

export default async function FrequencyPage() {
  let analytics;
  try {
    analytics = await loadFrequencyAnalytics();
  } catch (error) {
    console.error("Frequency analytics gagal dimuat", error);
    return <AnalyticsUnavailable title="Frequency" />;
  }

  return (
    <AppShell title="Frequency">
      <div className="space-y-4">
        <FadeInStagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {analytics.distribution.map((item) => (
            <FadeInItem key={item.bucket}>
              <Link href={bucketHref(item.bucket)}>
                <Card className="transition-all duration-150 hover:-translate-y-0.5 hover:bg-accent/50 hover:shadow-md active:scale-[0.98] active:translate-y-0">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-muted-foreground">{item.bucket}</p>
                    <p className="mt-2 text-2xl font-semibold">{item.customers.toLocaleString("id-ID")}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">total order tepat {item.bucket === "F5+" ? "5+" : item.bucket.slice(1)}</p>
                  </CardContent>
                </Card>
              </Link>
            </FadeInItem>
          ))}
        </FadeInStagger>

        <Card>
          <CardHeader><CardTitle>Frequency distribution</CardTitle><CardDescription>Eksklusif — satu customer hanya muncul di satu bucket. Frequency = jumlah hari unik transaksi.</CardDescription></CardHeader>
          <CardContent>{analytics.distribution.some((item) => item.customers) ? <FrequencyBarChart data={analytics.distribution} /> : <EmptyState />}</CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle>Repeat purchase funnel</CardTitle><CardDescription className="mt-1">Kumulatif — F1 sampai F{analytics.maxOrder || 0} dibuat dinamis dari order maksimum customer.</CardDescription></div><div className="flex gap-2"><Badge variant="outline">Users</Badge><Badge variant="outline">Data as of {formatDate(analytics.asOfDate)}</Badge></div></CardHeader>
          <CardContent>{analytics.rows.length ? <FrequencyFunnel rows={analytics.rows} maxOrder={analytics.maxOrder} /> : <EmptyState />}</CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function AnalyticsUnavailable({ title }: { title: string }) {
  return <AppShell title={title}><Card><CardHeader><CardTitle>Analytics belum tersedia</CardTitle><CardDescription>DATABASE_URL belum dikonfigurasi atau koneksi database gagal. Periksa server log.</CardDescription></CardHeader></Card></AppShell>;
}
function EmptyState() { return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Belum ada batch Database All aktif.</p>; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "—"; }
