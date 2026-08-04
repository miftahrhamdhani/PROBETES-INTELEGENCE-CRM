import Link from "next/link";
import { AlertTriangle, Sparkles } from "lucide-react";
import { loadClusterCustomerList, loadClusterDistribution } from "@/app/customers-actions";
import { CUSTOMER_LIST_CHUNK } from "@/lib/list-chunk";
import { AppShell } from "@/components/layout/app-shell";
import { ClusterBarChart } from "@/components/charts/overview-charts";
import { BroadcastExportButton } from "@/components/customer/broadcast-export-button";
import { ClusterCustomerTable } from "@/components/customer/cluster-customer-table";
import { CustomerDetailSheet } from "@/components/customer/customer-detail-sheet";
import { FadeInItem, FadeInStagger } from "@/components/motion/fade-in";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiahShort } from "@/lib/format";
import { CLUSTER_CODES, CLUSTER_LABELS, NON_CLUSTER_LABELS } from "@/lib/cluster-codes";
import { CLUSTER_DISPLAY } from "@/lib/cluster-display";
import { cn } from "@/lib/utils";
import { getActiveDatasetInfo } from "@/server/analytics/dataset";

export const dynamic = "force-dynamic";

const toneClasses = {
  violet: "border-violet-400 bg-violet-100 dark:border-violet-700 dark:bg-violet-950/40",
  blue: "border-blue-400 bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30",
  green: "border-green-400 bg-green-100 dark:border-green-700 dark:bg-green-950/40",
  orange: "border-orange-400 bg-orange-100 dark:border-orange-800 dark:bg-orange-950/30",
  slate: "border-slate-400 bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50",
  red: "border-rose-400 bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40",
} as const;

export default async function ClusterPage({
  searchParams,
}: {
  searchParams: Promise<{ cluster?: string; isNew?: string }>;
}) {
  const { cluster: focusParam, isNew: isNewParam } = await searchParams;
  const isNew = isNewParam === "1" ? true : undefined;

  let distribution;
  let dataset;
  try {
    [distribution, dataset] = await Promise.all([loadClusterDistribution(), getActiveDatasetInfo()]);
  } catch {
    return (
      <AppShell title="Customer Cluster">
        <Card>
          <CardHeader>
            <CardTitle>Data belum tersedia</CardTitle>
            <CardDescription>Belum ada batch Database All aktif, atau koneksi database gagal.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  const countByCode = new Map(distribution.map((d) => [d.code, d]));
  // Cluster B membutuhkan DataKSB; cluster C serta pembagian C vs D/Dhp
  // membutuhkan Group List. Angka 0 sebelum sumber terkait di-upload bukan hasil
  // final. Status otomatis hilang setelah batch sumber tersebut aktif.
  const missingSourceCodes = new Set<string>();
  if (!dataset.ksbActive) missingSourceCodes.add("B");
  if (!dataset.groupListActive) {
    missingSourceCodes.add("C_PRODIG");
    missingSourceCodes.add("C_HP");
    missingSourceCodes.add("C_F2");
  }
  const provisionalCodes = dataset.groupListActive
    ? new Set<string>()
    : new Set<string>(["D_NEW", "D_OLD", "DHP_NEW", "DHP_OLD"]);
  const cards = CLUSTER_CODES.map((code) => ({
    code,
    label: CLUSTER_LABELS[code],
    description: CLUSTER_DISPLAY[code].description,
    tone: CLUSTER_DISPLAY[code].tone,
    count: countByCode.get(code)?.customers ?? 0,
    monetary: BigInt(countByCode.get(code)?.monetary ?? "0"),
    unavailable: missingSourceCodes.has(code),
    provisional: provisionalCodes.has(code),
  }));

  const requestedFocus = focusParam && CLUSTER_CODES.includes(focusParam as (typeof CLUSTER_CODES)[number])
    ? (focusParam as (typeof CLUSTER_CODES)[number])
    : "A1";
  const focus = missingSourceCodes.has(requestedFocus) ? "A1" : requestedFocus;
  const focusCard = cards.find((c) => c.code === focus)!;

  const needsReview = countByCode.get("NEEDS_REVIEW")?.customers ?? 0;
  const filter = { cluster: focus, isNew };
  const initialData = await loadClusterCustomerList({ ...filter, page: 1, perPage: CUSTOMER_LIST_CHUNK });

  return (
    <AppShell title="Customer Cluster">
      <div className="space-y-4">
        {!dataset.ksbActive || !dataset.groupListActive ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              Distribusi belum final:{!dataset.ksbActive ? " DataKSB belum diimport (Cluster B tidak tersedia)." : ""}
              {!dataset.groupListActive ? " Group List belum diimport (Cluster C tidak tersedia; angka D/Dhp sementara terlalu besar)." : ""}
              {" "}Database All berisi {distribution.reduce((sum, row) => sum + row.customers, 0).toLocaleString("id-ID")} customer,
              termasuk {needsReview.toLocaleString("id-ID")} customer <strong>Needs Review</strong> yang bukan cluster resmi.
            </p>
          </div>
        ) : null}

        <FadeInStagger className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7" aria-label="14 cluster resmi">
          {cards.map((cluster) => {
            const content = (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wide">Cluster {cluster.label}</span>
                  <span className="h-2 w-2 rounded-full bg-current opacity-50" />
                </div>
                <p className="mt-2 text-xl font-bold tabular">{cluster.unavailable ? "—" : cluster.count.toLocaleString("id-ID")}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{cluster.unavailable ? "Sumber belum diimport" : formatRupiahShort(cluster.monetary)}</p>
                <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                  {cluster.description}{cluster.provisional ? " · SEMENTARA" : ""}
                </p>
              </>
            );
            const className = cn(
              "block min-h-28 rounded-lg border p-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              toneClasses[cluster.tone],
              cluster.unavailable ? "cursor-not-allowed opacity-60" : "hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] active:translate-y-0",
              cluster.code === focus && "ring-2 ring-ring"
            );
            return (
              <FadeInItem key={cluster.code} className="block">
                {cluster.unavailable ? (
                  <div className={className} aria-disabled="true">{content}</div>
                ) : (
                  <Link href={`/cluster?cluster=${cluster.code}${isNew ? "&isNew=1" : ""}`} className={className}>{content}</Link>
                )}
              </FadeInItem>
            );
          })}
        </FadeInStagger>

        {/* KPI/info cluster terfokus (kiri) + visualisasi ringkas (kanan) */}
        <section className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Card className={cn("border-l-4", toneClasses[focusCard.tone])}>
            <CardHeader className="space-y-0 pb-2">
              <Badge>{focusCard.label}</Badge>
              <CardTitle className="mt-2 text-3xl tabular">{focusCard.count.toLocaleString("id-ID")}</CardTitle>
              <CardDescription>customer{focusCard.provisional ? " · SEMENTARA" : ""}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="rounded-md bg-background/60 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total Monetary</p>
                <p className="mt-0.5 text-lg font-semibold tabular">{formatRupiahShort(focusCard.monetary)}</p>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{focusCard.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Customer per cluster</CardTitle>
              <CardDescription>14 cluster resmi · klik bar untuk pindah fokus</CardDescription>
            </CardHeader>
            <CardContent>
              <ClusterBarChart data={cards.filter((c) => !c.unavailable).map((c) => ({ code: c.code, label: c.label, count: c.count }))} compact />
            </CardContent>
          </Card>
        </section>

        {/* Tabel full width */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <div className="flex items-center gap-2">
                <Badge>{focusCard.label}</Badge>
                <CardTitle>{initialData.total.toLocaleString("id-ID")} customer</CardTitle>
              </div>
              <CardDescription className="mt-1">Klik baris untuk detail · scroll untuk memuat lebih banyak · kolom bisa di-resize</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/cluster?cluster=${focus}${isNew ? "" : "&isNew=1"}`}>
                <Badge variant={isNew ? "success" : "outline"} className="flex cursor-pointer items-center gap-1 hover:opacity-80">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Customer Baru
                </Badge>
              </Link>
              {/* FR-24: export memakai filter yang sama dengan tabel di bawah. */}
              <BroadcastExportButton filter={filter} expectedRows={initialData.total} />
            </div>
          </CardHeader>
          <CardContent>
            <ClusterCustomerTable filter={filter} initialData={initialData} />
          </CardContent>
        </Card>

        <section className="grid gap-3 sm:grid-cols-3">
          <StatusCard
            label={NON_CLUSTER_LABELS.NEEDS_REVIEW}
            value={needsReview.toLocaleString("id-ID")}
            description="Produk unknown memengaruhi assignment"
            variant="warning"
          />
          <StatusCard
            label={NON_CLUSTER_LABELS.YACONA_NON_COHORT}
            value={dataset.ksbActive ? (countByCode.get("YACONA_NON_COHORT")?.customers ?? 0).toLocaleString("id-ID") : "Menunggu upload DataKSB"}
            description={dataset.ksbActive ? "Customer KSB non-cohort" : "Belum tersedia — jalur upload KSB (FR-28) belum dibangun"}
            variant="outline"
          />
          <StatusCard
            label={NON_CLUSTER_LABELS.EXCLUDED_NO_PHONE}
            value="Lihat halaman Data Quality"
            description="Belum tersedia — halaman Data Quality (FR-18) belum dibangun"
            variant="outline"
          />
        </section>
      </div>

      <CustomerDetailSheet />
    </AppShell>
  );
}

function StatusCard({ label, value, description, variant }: { label: string; value: string; description: string; variant: "warning" | "outline" }) {
  return <Card className="border-dashed"><CardContent className="flex items-center justify-between p-4"><div><Badge variant={variant}>{label}</Badge><p className="mt-2 text-xs text-muted-foreground">{description}</p></div><p className="text-right text-xs font-semibold tabular">{value}</p></CardContent></Card>;
}
