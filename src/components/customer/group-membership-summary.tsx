import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { FadeInItem, FadeInStagger } from "@/components/motion/fade-in";
import { cn } from "@/lib/utils";
import type { MembershipSummary } from "@/lib/customer-types";

const toneClasses = {
  green: "border-green-400 bg-green-100 dark:border-green-700 dark:bg-green-950/40",
  slate: "border-slate-400 bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50",
  amber: "border-amber-400 bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40",
  red: "border-rose-400 bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40",
  violet: "border-violet-400 bg-violet-100 dark:border-violet-700 dark:bg-violet-950/40",
} as const;

export function GroupMembershipSummary({ summary }: { summary: MembershipSummary }) {
  const tiles: {
    key: string;
    label: string;
    value: number;
    description: string;
    tone: keyof typeof toneClasses;
    href: string;
  }[] = [
    {
      key: "grouped",
      label: "GROUPED",
      value: summary.grouped,
      description: "Sudah masuk grup (keputusan CRM/legacy)",
      tone: "green",
      href: "/groups?membershipStatus=GROUPED",
    },
    {
      key: "not_grouped",
      label: "NOT_GROUPED",
      value: summary.notGrouped,
      description: "Belum/tidak masuk grup",
      tone: "slate",
      href: "/groups?membershipStatus=NOT_GROUPED",
    },
    {
      key: "unknown",
      label: "UNKNOWN (operational)",
      value: summary.unknownOperational,
      description: "Termasuk customer tanpa baris membership sama sekali",
      tone: "amber",
      href: "/groups?membershipStatus=UNKNOWN",
    },
    {
      key: "conflict",
      label: "GROUP_STATUS_CONFLICT",
      value: summary.unresolvedConflict,
      description: "Ada di source GROUPED & NOT_GROUPED sekaligus, belum diselesaikan",
      tone: "red",
      href: "/groups?membershipStatus=CONFLICT",
    },
    {
      key: "needs_review",
      label: "NEEDS_REVIEW (grup)",
      value: summary.needsReviewMembership,
      description: "Cluster menunggu keputusan status grup CRM",
      tone: "violet",
      href: "/groups?cluster=NEEDS_REVIEW",
    },
  ];

  return (
    <FadeInStagger className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Ringkasan status membership">
      {tiles.map((tile) => (
        <FadeInItem key={tile.key}>
          <Link href={tile.href}>
            <Card className={cn("h-full transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] active:translate-y-0", toneClasses[tile.tone])}>
              <CardContent className="p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide">{tile.label}</p>
                <p className="mt-1 text-xl font-bold tabular">{tile.value.toLocaleString("id-ID")}</p>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{tile.description}</p>
              </CardContent>
            </Card>
          </Link>
        </FadeInItem>
      ))}
    </FadeInStagger>
  );
}
