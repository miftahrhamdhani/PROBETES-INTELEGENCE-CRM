import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  Gem,
  Leaf,
  Rocket,
  Send,
  Smartphone,
  Sparkles,
  Star,
  TriangleAlert,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { loadClusterCustomerList, loadClusterDistribution } from "@/app/customers-actions";
import { CUSTOMER_LIST_CHUNK } from "@/lib/list-chunk";
import { AppShell } from "@/components/layout/app-shell";
import { ClusterBarChart } from "@/components/charts/lazy-charts";
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

type ClusterCardTheme = {
  icon: LucideIcon;
  card: string;
  pill: string;
  iconWrap: string;
  footer: string;
};

const CLUSTER_CARD_THEMES: Record<(typeof CLUSTER_CODES)[number], ClusterCardTheme> = {
  A1: {
    icon: Star,
    card: "border-blue-200/80 bg-gradient-to-b from-white via-blue-50/45 to-blue-50/80 dark:border-blue-900 dark:from-slate-950 dark:via-blue-950/25 dark:to-blue-950/45",
    pill: "bg-blue-600 text-white shadow-blue-200/80 dark:bg-blue-500 dark:shadow-none",
    iconWrap: "border-blue-100 bg-white text-blue-600 shadow-blue-200/70 dark:border-blue-900 dark:bg-blue-950/80 dark:text-blue-300 dark:shadow-none",
    footer: "border-blue-100 bg-blue-100/60 text-blue-800 dark:border-blue-900 dark:bg-blue-950/55 dark:text-blue-200",
  },
  A2: {
    icon: Gem,
    card: "border-blue-200/80 bg-gradient-to-b from-white via-blue-50/45 to-blue-50/80 dark:border-blue-900 dark:from-slate-950 dark:via-blue-950/25 dark:to-blue-950/45",
    pill: "bg-blue-600 text-white shadow-blue-200/80 dark:bg-blue-500 dark:shadow-none",
    iconWrap: "border-blue-100 bg-white text-blue-600 shadow-blue-200/70 dark:border-blue-900 dark:bg-blue-950/80 dark:text-blue-300 dark:shadow-none",
    footer: "border-blue-100 bg-blue-100/60 text-blue-800 dark:border-blue-900 dark:bg-blue-950/55 dark:text-blue-200",
  },
  A3: {
    icon: BriefcaseBusiness,
    card: "border-blue-200/80 bg-gradient-to-b from-white via-blue-50/45 to-blue-50/80 dark:border-blue-900 dark:from-slate-950 dark:via-blue-950/25 dark:to-blue-950/45",
    pill: "bg-blue-600 text-white shadow-blue-200/80 dark:bg-blue-500 dark:shadow-none",
    iconWrap: "border-blue-100 bg-white text-blue-600 shadow-blue-200/70 dark:border-blue-900 dark:bg-blue-950/80 dark:text-blue-300 dark:shadow-none",
    footer: "border-blue-100 bg-blue-100/60 text-blue-800 dark:border-blue-900 dark:bg-blue-950/55 dark:text-blue-200",
  },
  A4: {
    icon: Send,
    card: "border-blue-200/80 bg-gradient-to-b from-white via-blue-50/45 to-blue-50/80 dark:border-blue-900 dark:from-slate-950 dark:via-blue-950/25 dark:to-blue-950/45",
    pill: "bg-blue-600 text-white shadow-blue-200/80 dark:bg-blue-500 dark:shadow-none",
    iconWrap: "border-blue-100 bg-white text-blue-600 shadow-blue-200/70 dark:border-blue-900 dark:bg-blue-950/80 dark:text-blue-300 dark:shadow-none",
    footer: "border-blue-100 bg-blue-100/60 text-blue-800 dark:border-blue-900 dark:bg-blue-950/55 dark:text-blue-200",
  },
  B: {
    icon: Leaf,
    card: "border-green-200/80 bg-gradient-to-b from-white via-green-50/45 to-green-50/80 dark:border-green-900 dark:from-slate-950 dark:via-green-950/25 dark:to-green-950/45",
    pill: "bg-green-600 text-white shadow-green-200/80 dark:bg-green-600 dark:shadow-none",
    iconWrap: "border-green-100 bg-white text-green-600 shadow-green-200/70 dark:border-green-900 dark:bg-green-950/80 dark:text-green-300 dark:shadow-none",
    footer: "border-green-100 bg-green-100/60 text-green-800 dark:border-green-900 dark:bg-green-950/55 dark:text-green-200",
  },
  C_PRODIG: {
    icon: Rocket,
    card: "border-teal-200/80 bg-gradient-to-b from-white via-teal-50/45 to-teal-50/80 dark:border-teal-900 dark:from-slate-950 dark:via-teal-950/25 dark:to-teal-950/45",
    pill: "bg-teal-600 text-white shadow-teal-200/80 dark:bg-teal-600 dark:shadow-none",
    iconWrap: "border-teal-100 bg-white text-teal-600 shadow-teal-200/70 dark:border-teal-900 dark:bg-teal-950/80 dark:text-teal-300 dark:shadow-none",
    footer: "border-teal-100 bg-teal-100/60 text-teal-800 dark:border-teal-900 dark:bg-teal-950/55 dark:text-teal-200",
  },
  C_HP: {
    icon: Smartphone,
    card: "border-teal-200/80 bg-gradient-to-b from-white via-teal-50/45 to-teal-50/80 dark:border-teal-900 dark:from-slate-950 dark:via-teal-950/25 dark:to-teal-950/45",
    pill: "bg-teal-600 text-white shadow-teal-200/80 dark:bg-teal-600 dark:shadow-none",
    iconWrap: "border-teal-100 bg-white text-teal-600 shadow-teal-200/70 dark:border-teal-900 dark:bg-teal-950/80 dark:text-teal-300 dark:shadow-none",
    footer: "border-teal-100 bg-teal-100/60 text-teal-800 dark:border-teal-900 dark:bg-teal-950/55 dark:text-teal-200",
  },
  C_F2: {
    icon: Users,
    card: "border-teal-200/80 bg-gradient-to-b from-white via-teal-50/45 to-teal-50/80 dark:border-teal-900 dark:from-slate-950 dark:via-teal-950/25 dark:to-teal-950/45",
    pill: "bg-teal-600 text-white shadow-teal-200/80 dark:bg-teal-600 dark:shadow-none",
    iconWrap: "border-teal-100 bg-white text-teal-600 shadow-teal-200/70 dark:border-teal-900 dark:bg-teal-950/80 dark:text-teal-300 dark:shadow-none",
    footer: "border-teal-100 bg-teal-100/60 text-teal-800 dark:border-teal-900 dark:bg-teal-950/55 dark:text-teal-200",
  },
  D_NEW: {
    icon: UserPlus,
    card: "border-orange-200/80 bg-gradient-to-b from-white via-orange-50/45 to-orange-50/80 dark:border-orange-900 dark:from-slate-950 dark:via-orange-950/25 dark:to-orange-950/45",
    pill: "bg-orange-500 text-white shadow-orange-200/80 dark:bg-orange-600 dark:shadow-none",
    iconWrap: "border-orange-100 bg-white text-orange-500 shadow-orange-200/70 dark:border-orange-900 dark:bg-orange-950/80 dark:text-orange-300 dark:shadow-none",
    footer: "border-orange-100 bg-orange-100/60 text-orange-800 dark:border-orange-900 dark:bg-orange-950/55 dark:text-orange-200",
  },
  D_OLD: {
    icon: Clock3,
    card: "border-orange-200/80 bg-gradient-to-b from-white via-orange-50/45 to-orange-50/80 dark:border-orange-900 dark:from-slate-950 dark:via-orange-950/25 dark:to-orange-950/45",
    pill: "bg-orange-500 text-white shadow-orange-200/80 dark:bg-orange-600 dark:shadow-none",
    iconWrap: "border-orange-100 bg-white text-orange-500 shadow-orange-200/70 dark:border-orange-900 dark:bg-orange-950/80 dark:text-orange-300 dark:shadow-none",
    footer: "border-orange-100 bg-orange-100/60 text-orange-800 dark:border-orange-900 dark:bg-orange-950/55 dark:text-orange-200",
  },
  DHP_NEW: {
    icon: Smartphone,
    card: "border-orange-200/80 bg-gradient-to-b from-white via-orange-50/45 to-orange-50/80 dark:border-orange-900 dark:from-slate-950 dark:via-orange-950/25 dark:to-orange-950/45",
    pill: "bg-orange-500 text-white shadow-orange-200/80 dark:bg-orange-600 dark:shadow-none",
    iconWrap: "border-orange-100 bg-white text-orange-500 shadow-orange-200/70 dark:border-orange-900 dark:bg-orange-950/80 dark:text-orange-300 dark:shadow-none",
    footer: "border-orange-100 bg-orange-100/60 text-orange-800 dark:border-orange-900 dark:bg-orange-950/55 dark:text-orange-200",
  },
  DHP_OLD: {
    icon: CalendarDays,
    card: "border-orange-200/80 bg-gradient-to-b from-white via-orange-50/45 to-orange-50/80 dark:border-orange-900 dark:from-slate-950 dark:via-orange-950/25 dark:to-orange-950/45",
    pill: "bg-orange-500 text-white shadow-orange-200/80 dark:bg-orange-600 dark:shadow-none",
    iconWrap: "border-orange-100 bg-white text-orange-500 shadow-orange-200/70 dark:border-orange-900 dark:bg-orange-950/80 dark:text-orange-300 dark:shadow-none",
    footer: "border-orange-100 bg-orange-100/60 text-orange-800 dark:border-orange-900 dark:bg-orange-950/55 dark:text-orange-200",
  },
  E: {
    icon: BookOpen,
    card: "border-slate-200/90 bg-gradient-to-b from-white via-slate-50/55 to-slate-100/75 dark:border-slate-700 dark:from-slate-950 dark:via-slate-900/60 dark:to-slate-900/85",
    pill: "bg-slate-500 text-white shadow-slate-200/80 dark:bg-slate-600 dark:shadow-none",
    iconWrap: "border-slate-200 bg-white text-slate-500 shadow-slate-200/70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:shadow-none",
    footer: "border-slate-200 bg-slate-200/55 text-slate-700 dark:border-slate-700 dark:bg-slate-800/75 dark:text-slate-200",
  },
  F: {
    icon: TriangleAlert,
    card: "border-red-200/80 bg-gradient-to-b from-white via-red-50/40 to-red-50/80 dark:border-red-900 dark:from-slate-950 dark:via-red-950/20 dark:to-red-950/40",
    pill: "bg-red-500 text-white shadow-red-200/80 dark:bg-red-600 dark:shadow-none",
    iconWrap: "border-red-100 bg-white text-red-500 shadow-red-200/70 dark:border-red-900 dark:bg-red-950/80 dark:text-red-300 dark:shadow-none",
    footer: "border-red-100 bg-red-100/60 text-red-800 dark:border-red-900 dark:bg-red-950/55 dark:text-red-200",
  },
};

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

        <FadeInStagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7" aria-label="14 cluster resmi">
          {cards.map((cluster) => {
            const theme = CLUSTER_CARD_THEMES[cluster.code];
            const Icon = theme.icon;
            const content = (
              <>
                <div className="relative flex min-h-10 items-start justify-center px-2 pt-3">
                  <span className={cn(
                    "absolute -top-px rounded-b-lg px-5 py-1 text-center text-[9px] font-bold uppercase tracking-[0.08em] shadow-sm",
                    theme.pill
                  )}>
                    Cluster {cluster.label}
                  </span>
                </div>
                <div className="flex flex-1 items-center gap-3 px-3 pb-3 pt-1">
                  <span className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border shadow-[0_6px_16px_-8px_currentColor]",
                    theme.iconWrap
                  )}>
                    <Icon className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[1.35rem] font-bold leading-none tracking-tight text-foreground">
                      {cluster.unavailable ? "—" : cluster.count.toLocaleString("id-ID")}
                    </p>
                    <p className="mt-1.5 truncate text-[10px] font-medium text-muted-foreground">
                      {cluster.unavailable ? "Sumber belum diimport" : formatRupiahShort(cluster.monetary)}
                    </p>
                  </div>
                </div>
                <div className={cn(
                  "flex min-h-9 items-center justify-center border-t px-2 py-2 text-center text-[9px] font-medium leading-3.5",
                  theme.footer
                )}>
                  {cluster.description}{cluster.provisional ? " · SEMENTARA" : ""}
                </div>
              </>
            );
            const className = cn(
              "group flex min-h-36 flex-col overflow-hidden rounded-xl border text-left shadow-[0_7px_22px_-15px_rgba(15,23,42,0.38)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              theme.card,
              cluster.unavailable
                ? "cursor-not-allowed opacity-60"
                : "hover:-translate-y-0.5 hover:border-current/20 hover:shadow-[0_12px_26px_-15px_rgba(15,23,42,0.48)] active:translate-y-0 active:scale-[0.99]",
              cluster.code === focus && "ring-2 ring-primary/70 ring-offset-2"
            );
            return (
              <FadeInItem key={cluster.code} className="block h-full">
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
