"use client";

import { WorkspaceDateRangePicker } from "@/components/ui/date-range-picker";
import { PendingIndicator } from "@/components/ui/pending-indicator";
import { useUrlFilterUpdater } from "./use-url-filter";

/** Overview hanya punya satu filter: Rentang Tanggal (§7). */
export function OverviewFilterBar({ defaults }: { defaults: { from?: string; to?: string } }) {
  const update = useUrlFilterUpdater();
  return (
    <div className="flex items-center gap-2">
      <WorkspaceDateRangePicker
        from={defaults.from ?? null}
        to={defaults.to ?? null}
        onChange={(range) => update({ from: range.from, to: range.to })}
        className="h-8 bg-card px-3 shadow-sm"
      />
      <PendingIndicator show={update.isPending} />
    </div>
  );
}
