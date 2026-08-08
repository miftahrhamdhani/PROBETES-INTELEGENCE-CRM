import { Clock, RefreshCw, TriangleAlert, UserPlus, Users, UsersRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GroupMembershipKpi } from "@/lib/group-membership-types";

/**
 * KPI Group Membership — SENGAJA tidak lagi menampilkan GROUPED/NOT_GROUPED/
 * UNKNOWN/CONFLICT sebagai kartu utama: halaman ini hanya berisi customer yang
 * SUDAH masuk grup, jadi memecahnya per status tidak lagi bermakna.
 *
 * Angka apa adanya dari database. Nilai yang belum pernah diisi (mis. tanggal
 * masuk grup pada membership legacy) tampil 0/— dan TIDAK diperkirakan.
 */
const TONE = {
  green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300",
} as const;

export function GroupMembershipKpiGrid({ kpi }: { kpi: GroupMembershipKpi }) {
  const bulanIni = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5" aria-label="Ringkasan Group Membership">
      <Tile
        tone="green"
        icon={UsersRound}
        label="Total Member Grup"
        value={kpi.totalMembers.toLocaleString("id-ID")}
        sub="Customer sudah masuk grup"
      />
      <Tile
        tone="blue"
        icon={UserPlus}
        label="Member Baru Bulan Ini"
        value={kpi.newThisMonth.toLocaleString("id-ID")}
        sub={
          kpi.newThisMonth === 0
            ? "Belum ada tanggal masuk grup tercatat"
            : bulanIni
        }
      />
      <Tile
        tone="violet"
        icon={Users}
        label="Jumlah Grup Aktif"
        value={kpi.activeGroups.toLocaleString("id-ID")}
        sub={kpi.activeGroups === 0 ? "Nama grup belum terisi" : "Total grup konsultasi"}
      />
      <Tile
        tone="amber"
        icon={TriangleAlert}
        label="Unmatched Import"
        value={kpi.unmatchedLastImport === null ? "—" : kpi.unmatchedLastImport.toLocaleString("id-ID")}
        sub={kpi.unmatchedLastImport === null ? "Belum pernah import grup" : "Dari import terakhir"}
      />
      <Tile
        tone="rose"
        icon={kpi.lastUpdatedAt ? RefreshCw : Clock}
        label="Update Terakhir"
        value={kpi.lastUpdatedAt ? formatDate(kpi.lastUpdatedAt) : "—"}
        sub={kpi.lastUpdatedByName ? `Oleh ${kpi.lastUpdatedByName}` : "Belum ada pembaruan"}
      />
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub: string;
  tone: keyof typeof TONE;
}) {
  return (
    <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-800">
      <CardContent className="flex items-start gap-3 p-4">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", TONE[tone])}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-2xl font-bold leading-tight tabular">{value}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}
