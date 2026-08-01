import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { FadeInItem, FadeInStagger } from "@/components/motion/fade-in";
import { cn } from "@/lib/utils";
import type { WorkspaceOverviewKpi } from "@/lib/workspace-types";

const toneClasses = {
  violet: "border-violet-400 bg-violet-100 dark:border-violet-700 dark:bg-violet-950/40",
  slate: "border-slate-400 bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50",
  blue: "border-blue-400 bg-blue-100 dark:border-blue-700 dark:bg-blue-950/40",
  amber: "border-amber-400 bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40",
  green: "border-green-400 bg-green-100 dark:border-green-700 dark:bg-green-950/40",
  red: "border-rose-400 bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40",
  teal: "border-teal-400 bg-teal-100 dark:border-teal-700 dark:bg-teal-950/40",
} as const;

export function WorkspaceOverviewKpiTiles({ kpi }: { kpi: WorkspaceOverviewKpi }) {
  const tiles: { key: string; label: string; value: number; tone: keyof typeof toneClasses; href: string }[] = [
    { key: "new", label: "Customer Baru (Import Terakhir)", value: kpi.newCustomersLastImport, tone: "violet", href: "/workspace/pembagian-tugas?taskType=FOLLOW_UP_NEW_CUSTOMER" },
    { key: "unassigned", label: "Belum Dibagi", value: kpi.unassigned, tone: "slate", href: "/workspace/pembagian-tugas?status=UNASSIGNED" },
    { key: "assigned", label: "Assigned", value: kpi.assigned, tone: "blue", href: "/workspace/pembagian-tugas?status=ASSIGNED" },
    { key: "in_progress", label: "In Progress", value: kpi.inProgress, tone: "amber", href: "/workspace/pembagian-tugas?status=IN_PROGRESS" },
    { key: "done", label: "Selesai", value: kpi.done, tone: "green", href: "/workspace/pembagian-tugas?status=DONE" },
    { key: "overdue", label: "Overdue", value: kpi.overdue, tone: "red", href: "/workspace/pembagian-tugas?overdue=1" },
    { key: "closing", label: "Closing", value: kpi.closing, tone: "teal", href: "/workspace/pembagian-tugas?outcome=CLOSING" },
    { key: "joined_group", label: "Masuk Grup", value: kpi.joinedGroup, tone: "green", href: "/workspace/pembagian-tugas?outcome=JOINED_GROUP" },
  ];

  return (
    <FadeInStagger className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ringkasan Workspace">
      {tiles.map((tile) => (
        <FadeInItem key={tile.key}>
          <Link href={tile.href}>
            <Card className={cn("h-full transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] active:translate-y-0", toneClasses[tile.tone])}>
              <CardContent className="p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide">{tile.label}</p>
                <p className="mt-1 text-xl font-bold tabular">{tile.value.toLocaleString("id-ID")}</p>
              </CardContent>
            </Card>
          </Link>
        </FadeInItem>
      ))}
    </FadeInStagger>
  );
}
