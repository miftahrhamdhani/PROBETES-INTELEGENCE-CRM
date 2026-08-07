import Link from "next/link";
import { AlertCircle, CircleCheck, ClipboardList, Timer, UserCheck, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkspaceOverviewKpi } from "@/lib/workspace-types";

/**
 * 6 KPI Pembagian Tugas. SELURUH angka berasal dari `getWorkspaceOverview()`
 * (server action `loadWorkspaceOverview` yang sudah ada) — dihitung real-time
 * dari `crm_tasks`, tidak ada mock dan tidak ada perubahan backend.
 *
 * "Total Task" = UNASSIGNED + ASSIGNED + IN_PROGRESS + DONE. Task berstatus
 * Dibatalkan sengaja TIDAK ikut, konsisten dengan tabel di bawahnya yang juga
 * menyembunyikan Dibatalkan secara default — supaya persentase tiap kartu
 * menjumlah wajar terhadap total yang benar-benar terlihat operator.
 *
 * "Overdue" adalah IRISAN dari Assigned/In Progress (task lewat due date yang
 * belum selesai), bukan status tersendiri — jadi persentasenya memang tumpang
 * tindih dengan kartu lain. Itu disebutkan di tooltip kartunya.
 */
type Tone = "blue" | "amber" | "indigo" | "violet" | "rose" | "emerald";

const TONE: Record<Tone, string> = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
};

function percentOf(value: number, total: number): string {
  if (total <= 0) return "0% dari total";
  return `${((value / total) * 100).toFixed(1).replace(".", ",")}% dari total`;
}

export function TaskKpiGrid({ kpi }: { kpi: WorkspaceOverviewKpi }) {
  const total = kpi.unassigned + kpi.assigned + kpi.inProgress + kpi.done;

  const cards: {
    key: string;
    label: string;
    value: number;
    caption: string;
    icon: LucideIcon;
    tone: Tone;
    href: string;
    title: string;
  }[] = [
    {
      key: "total",
      label: "Total Task",
      value: total,
      caption: "Semua tugas",
      icon: ClipboardList,
      tone: "blue",
      href: "/workspace/pembagian-tugas",
      title: "Belum Dibagi + Assigned + In Progress + Selesai (tanpa task Dibatalkan)",
    },
    {
      key: "unassigned",
      label: "Belum Dibagi",
      value: kpi.unassigned,
      caption: percentOf(kpi.unassigned, total),
      icon: Users,
      tone: "amber",
      href: "/workspace/pembagian-tugas?status=UNASSIGNED",
      title: "Task yang belum punya PIC",
    },
    {
      key: "assigned",
      label: "Assigned",
      value: kpi.assigned,
      caption: percentOf(kpi.assigned, total),
      icon: UserCheck,
      tone: "indigo",
      href: "/workspace/pembagian-tugas?status=ASSIGNED",
      title: "Task yang sudah punya PIC tapi belum dikerjakan",
    },
    {
      key: "in_progress",
      label: "In Progress",
      value: kpi.inProgress,
      caption: percentOf(kpi.inProgress, total),
      icon: Timer,
      tone: "violet",
      href: "/workspace/pembagian-tugas?status=IN_PROGRESS",
      title: "Task yang sedang dikerjakan PIC",
    },
    {
      key: "overdue",
      label: "Overdue",
      value: kpi.overdue,
      caption: percentOf(kpi.overdue, total),
      icon: AlertCircle,
      tone: "rose",
      href: "/workspace/pembagian-tugas?overdue=1",
      title: "Lewat due date & belum selesai — irisan dari Assigned/In Progress, bukan status tersendiri",
    },
    {
      key: "done",
      label: "Selesai",
      value: kpi.done,
      caption: percentOf(kpi.done, total),
      icon: CircleCheck,
      tone: "emerald",
      href: "/workspace/pembagian-tugas?status=DONE",
      title: "Task yang sudah diselesaikan dengan outcome",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Ringkasan Pembagian Tugas">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Link
            key={card.key}
            href={card.href}
            title={card.title}
            scroll={false}
            className={cn(
              "group rounded-xl border border-slate-200 bg-card p-4 shadow-sm transition-all",
              "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "dark:border-slate-800 dark:hover:border-slate-700"
            )}
          >
            <div className="flex items-start gap-3">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", TONE[card.tone])}>
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-muted-foreground">{card.label}</p>
                <p className="mt-1 text-2xl font-semibold leading-none tracking-tight tabular">
                  {card.value.toLocaleString("id-ID")}
                </p>
                <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{card.caption}</p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
