import Link from "next/link";
import { Sparkles, UserPlus, Users, UsersRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * KPI Customers — HANYA muncul di halaman utama /customers (bukan drill-down
 * Cluster/Cohort/RFM/Frequency). Seluruh angka datang dari action yang SUDAH
 * ADA (loadCustomerList/loadMembershipSummary) — tidak ada query baru.
 *
 * "Customer Aktif/Tidak Aktif" sengaja tidak ada: tidak ada flag aktif di
 * skema hari ini, dan kartu ini digantikan "Customer Baru" sesuai keputusan
 * bisnis (bukan ditebak dari recency — lihat CLAUDE.md).
 */
export type CustomerKpiData = {
  total: number;
  customerBaru: number;
  grouped: number;
  notGrouped: number;
  unknownOperational: number;
};

const TILES: {
  key: keyof Omit<CustomerKpiData, "unknownOperational">;
  label: string;
  description: string;
  icon: typeof Users;
  href: string;
  tone: "blue" | "amber" | "violet" | "cyan";
}[] = [
  {
    key: "total",
    label: "Total Customer",
    description: "Seluruh customer terdaftar",
    icon: Users,
    href: "/customers",
    tone: "blue",
  },
  {
    key: "customerBaru",
    label: "Customer Baru",
    description: "First order di batch aktif saat ini",
    icon: Sparkles,
    href: "/customers?isNew=1",
    tone: "amber",
  },
  {
    key: "grouped",
    label: "Sudah Masuk Grup",
    description: "Customer dalam grup",
    icon: UsersRound,
    href: "/customers?membershipStatus=GROUPED",
    tone: "violet",
  },
  {
    key: "notGrouped",
    label: "Belum Masuk Grup",
    description: "Customer tanpa grup",
    icon: UserPlus,
    href: "/customers?membershipStatus=NOT_GROUPED",
    tone: "cyan",
  },
];

const TONE_CLASSES: Record<(typeof TILES)[number]["tone"], string> = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300",
  cyan: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-300",
};

export function CustomerKpiCards({ kpis }: { kpis: CustomerKpiData }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="KPI Customers">
      {TILES.map((tile) => {
        const Icon = tile.icon;
        const value = kpis[tile.key];
        return (
          <Link key={tile.key} href={tile.href}>
            <Card className="h-full rounded-xl border-slate-200 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99] dark:border-slate-800">
              <CardContent className="flex items-start gap-3 p-4">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONE_CLASSES[tile.tone])}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-2xl font-bold leading-tight tabular">{value.toLocaleString("id-ID")}</p>
                  <p className="mt-0.5 text-xs font-semibold text-foreground">{tile.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {tile.description}
                    {tile.key === "notGrouped" && kpis.unknownOperational > 0
                      ? ` · Unknown: ${kpis.unknownOperational.toLocaleString("id-ID")}`
                      : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

export function CustomerKpiCardsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {TILES.map((tile) => (
        <Card key={tile.key} className="h-full rounded-xl border-slate-200 shadow-sm dark:border-slate-800">
          <CardContent className="flex items-start gap-3 p-4">
            <span className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-6 w-16 animate-pulse rounded bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
