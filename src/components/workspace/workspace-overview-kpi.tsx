import Link from "next/link";
import {
  CircleAlert,
  CircleCheck,
  Clock3,
  Flag,
  UserRound,
  UserRoundPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { FadeInItem, FadeInStagger } from "@/components/motion/fade-in";
import { cn } from "@/lib/utils";
import type { WorkspaceOverviewKpi } from "@/lib/workspace-types";

const toneClasses = {
  violet: {
    icon: "border-violet-300/70 bg-violet-50 text-violet-600 shadow-[0_8px_24px_-14px_rgba(124,58,237,0.45)] dark:border-violet-400/35 dark:bg-violet-500/10 dark:text-violet-300 dark:shadow-[0_0_24px_-10px_rgba(167,139,250,0.9)]",
    glow: "from-violet-200/40 dark:from-violet-400/[0.08]",
  },
  slate: {
    icon: "border-slate-300 bg-slate-50 text-slate-600 shadow-[0_8px_24px_-14px_rgba(71,85,105,0.35)] dark:border-slate-400/30 dark:bg-slate-400/[0.08] dark:text-slate-300 dark:shadow-[0_0_24px_-10px_rgba(148,163,184,0.65)]",
    glow: "from-slate-200/35 dark:from-slate-300/[0.06]",
  },
  blue: {
    icon: "border-blue-300/70 bg-blue-50 text-blue-600 shadow-[0_8px_24px_-14px_rgba(37,99,235,0.4)] dark:border-blue-300/30 dark:bg-blue-400/[0.08] dark:text-blue-100 dark:shadow-[0_0_24px_-10px_rgba(147,197,253,0.7)]",
    glow: "from-blue-200/40 dark:from-blue-300/[0.06]",
  },
  amber: {
    icon: "border-amber-300/80 bg-amber-50 text-amber-600 shadow-[0_8px_24px_-14px_rgba(217,119,6,0.4)] dark:border-amber-400/35 dark:bg-amber-400/[0.09] dark:text-amber-300 dark:shadow-[0_0_24px_-10px_rgba(251,191,36,0.75)]",
    glow: "from-amber-200/40 dark:from-amber-400/[0.07]",
  },
  green: {
    icon: "border-emerald-300/75 bg-emerald-50 text-emerald-600 shadow-[0_8px_24px_-14px_rgba(5,150,105,0.4)] dark:border-emerald-400/30 dark:bg-emerald-400/[0.08] dark:text-emerald-200 dark:shadow-[0_0_24px_-10px_rgba(74,222,128,0.7)]",
    glow: "from-emerald-200/40 dark:from-emerald-400/[0.06]",
  },
  red: {
    icon: "border-rose-300/75 bg-rose-50 text-rose-600 shadow-[0_8px_24px_-14px_rgba(225,29,72,0.4)] dark:border-rose-400/35 dark:bg-rose-400/[0.09] dark:text-rose-300 dark:shadow-[0_0_24px_-10px_rgba(251,113,133,0.75)]",
    glow: "from-rose-200/40 dark:from-rose-400/[0.07]",
  },
  teal: {
    icon: "border-cyan-300/75 bg-cyan-50 text-cyan-600 shadow-[0_8px_24px_-14px_rgba(8,145,178,0.4)] dark:border-cyan-400/30 dark:bg-cyan-400/[0.08] dark:text-cyan-200 dark:shadow-[0_0_24px_-10px_rgba(34,211,238,0.7)]",
    glow: "from-cyan-200/40 dark:from-cyan-400/[0.06]",
  },
  olive: {
    icon: "border-lime-300/80 bg-lime-50 text-lime-700 shadow-[0_8px_24px_-14px_rgba(77,124,15,0.38)] dark:border-lime-400/30 dark:bg-lime-400/[0.07] dark:text-lime-200 dark:shadow-[0_0_24px_-10px_rgba(163,230,53,0.65)]",
    glow: "from-lime-200/35 dark:from-lime-400/[0.05]",
  },
} as const;

type WorkspaceKpiTile = {
  key: string;
  label: string;
  value: number;
  tone: keyof typeof toneClasses;
  icon: LucideIcon;
  href: string;
};

export function WorkspaceOverviewKpiTiles({ kpi }: { kpi: WorkspaceOverviewKpi }) {
  const tiles: WorkspaceKpiTile[] = [
    { key: "new", label: "Customer Baru (Import Terakhir)", value: kpi.newCustomersLastImport, tone: "violet", icon: UserRoundPlus, href: "/workspace/pembagian-tugas?taskType=FOLLOW_UP_NEW_CUSTOMER" },
    { key: "unassigned", label: "Belum Dibagi", value: kpi.unassigned, tone: "slate", icon: Users, href: "/workspace/pembagian-tugas?status=UNASSIGNED" },
    { key: "assigned", label: "Assigned", value: kpi.assigned, tone: "blue", icon: UserRound, href: "/workspace/pembagian-tugas?status=ASSIGNED" },
    { key: "in_progress", label: "In Progress", value: kpi.inProgress, tone: "amber", icon: Clock3, href: "/workspace/pembagian-tugas?status=IN_PROGRESS" },
    { key: "done", label: "Selesai", value: kpi.done, tone: "green", icon: CircleCheck, href: "/workspace/pembagian-tugas?status=DONE" },
    { key: "overdue", label: "Overdue", value: kpi.overdue, tone: "red", icon: CircleAlert, href: "/workspace/pembagian-tugas?overdue=1" },
    { key: "closing", label: "Closing", value: kpi.closing, tone: "teal", icon: Flag, href: "/workspace/pembagian-tugas?outcome=CLOSING" },
    { key: "joined_group", label: "Masuk Grup", value: kpi.joinedGroup, tone: "olive", icon: UsersRound, href: "/workspace/pembagian-tugas?outcome=JOINED_GROUP" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm dark:border-slate-800/80 dark:bg-[#0b0f16] sm:p-3">
      <FadeInStagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ringkasan Workspace">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const theme = toneClasses[tile.tone];
          return (
            <FadeInItem key={tile.key} className="h-full">
              <Link
                href={tile.href}
                className="group relative flex min-h-36 h-full overflow-hidden rounded-2xl border border-slate-200/90 bg-[linear-gradient(135deg,#ffffff_0%,#fbfdff_52%,#f6f8fb_100%)] px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_36px_-28px_rgba(15,23,42,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_20px_42px_-26px_rgba(15,23,42,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:translate-y-0 active:scale-[0.99] dark:border-slate-800/90 dark:bg-[linear-gradient(135deg,#151a22_0%,#10151c_52%,#0d1117_100%)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_16px_42px_-30px_rgba(0,0,0,0.95)] dark:hover:border-slate-700 dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_22px_45px_-28px_rgba(0,0,0,1)] dark:focus-visible:ring-offset-[#0b0f16]"
              >
                <span className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent opacity-80", theme.glow)} />
                <div className="relative flex w-full items-center gap-5">
                  <span className={cn("flex h-[4.65rem] w-[4.65rem] shrink-0 items-center justify-center rounded-xl border", theme.icon)}>
                    <Icon className="h-8 w-8" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 self-center">
                    <p className="max-w-48 text-[11px] font-semibold uppercase leading-[1.45] tracking-[0.045em] text-slate-600 dark:text-slate-300">
                      {tile.label}
                    </p>
                    <p className="mt-3 text-[2rem] font-bold leading-none tracking-tight text-slate-950 dark:text-slate-50">
                      {tile.value.toLocaleString("id-ID")}
                    </p>
                  </div>
                </div>
              </Link>
            </FadeInItem>
          );
        })}
      </FadeInStagger>
    </div>
  );
}
