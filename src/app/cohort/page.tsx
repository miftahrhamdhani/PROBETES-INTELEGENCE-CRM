import { loadRetentionAnalytics } from "@/app/analytics-actions";
import { AppShell } from "@/components/layout/app-shell";
import { RetentionTable } from "@/components/analytics/retention-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeInItem, FadeInStagger } from "@/components/motion/fade-in";

export const dynamic = "force-dynamic";

export default async function CohortPage() {
  let analytics;
  try {
    analytics = await loadRetentionAnalytics();
  } catch (error) {
    console.error("Retention analytics gagal dimuat", error);
    return <AnalyticsUnavailable title="Cohort & Retention" />;
  }

  return (
    <AppShell title="Cohort & Retention">
      <div className="space-y-4">
        <FadeInStagger className="grid gap-3 sm:grid-cols-3">
          <FadeInItem><Metric label="Average M1 retention" value={formatPercent(analytics.averageM1Retention)} detail="Customer kembali satu bulan kemudian" /></FadeInItem>
          <FadeInItem><Metric label="Cohort customers" value={formatInteger(analytics.cohortCustomers)} detail="First eligible Probetes purchase" /></FadeInItem>
          <FadeInItem><Metric label="Returning customers" value={formatInteger(analytics.returningCustomers)} detail="Pernah transaksi di bulan berikutnya" /></FadeInItem>
        </FadeInStagger>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div><CardTitle>Legacy retention table</CardTitle><CardDescription className="mt-1">M0–M24 · M0 = bulan first eligible Probetes purchase · Yacona/KSB dikeluarkan.</CardDescription></div>
            <div className="flex gap-2"><Badge variant="outline">Users</Badge><Badge variant="outline">Data as of {formatDate(analytics.asOfDate)}</Badge></div>
          </CardHeader>
          <CardContent>{analytics.rows.length ? <RetentionTable rows={analytics.rows} maxMonth={analytics.maxMonth} /> : <EmptyState />}</CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>How to read</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
            <p><strong className="text-foreground">M0 dihitung dari data.</strong> Nilainya 100% bila seluruh first-order customer terbentuk benar.</p>
            <p><strong className="text-foreground">M1, M2, … M24.</strong> Persentase cohort yang aktif di bulan kalender tersebut; sel kosong berarti belum mencapai bulan itu.</p>
            <p><strong className="text-foreground">PARTIAL.</strong> Bulan yang sama dengan as_of_date belum lengkap; jangan dibandingkan langsung dengan bulan penuh.</p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card><CardContent className="p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}
function AnalyticsUnavailable({ title }: { title: string }) {
  return <AppShell title={title}><Card><CardHeader><CardTitle>Analytics belum tersedia</CardTitle><CardDescription>DATABASE_URL belum dikonfigurasi atau koneksi database gagal. Periksa server log.</CardDescription></CardHeader></Card></AppShell>;
}
function EmptyState() { return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Belum ada batch Database All aktif.</p>; }
function formatInteger(value: number) { return value.toLocaleString("id-ID"); }
function formatPercent(value: number) { return `${value.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "—"; }
