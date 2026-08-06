"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { WorkspaceDateRangePicker } from "@/components/ui/date-range-picker";
import { PendingIndicator } from "@/components/ui/pending-indicator";
import { WORKSPACE_COST_CATEGORIES, WORKSPACE_COST_CATEGORY_LABEL, WORKSPACE_COST_STATUSES } from "@/lib/workspace-cost-contracts";
import { useUrlFilterUpdater } from "./use-url-filter";

export function CostFilterBar({ defaults }: { defaults: { from?: string; to?: string; category?: string; status?: string; search?: string } }) {
  const update = useUrlFilterUpdater();
  const [search, setSearch] = React.useState(defaults.search ?? "");

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
      <WorkspaceDateRangePicker
        from={defaults.from ?? null}
        to={defaults.to ?? null}
        onChange={(range) => update({ from: range.from, to: range.to })}
      />
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Kategori</span>
        <select
          defaultValue={defaults.category ?? ""}
          onChange={(e) => update({ category: e.target.value || null })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">Semua</option>
          {WORKSPACE_COST_CATEGORIES.map((c) => (
            <option key={c} value={c}>{WORKSPACE_COST_CATEGORY_LABEL[c]}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Status</span>
        <select
          defaultValue={defaults.status ?? ""}
          onChange={(e) => update({ status: e.target.value || null })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">Semua</option>
          {WORKSPACE_COST_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Cari Nama Biaya</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && update({ search: search || null })}
            onBlur={() => update({ search: search || null })}
            placeholder="Nama biaya..."
            className="h-8 w-48 pl-7 text-xs"
          />
        </div>
      </label>
      <PendingIndicator show={update.isPending} />
    </div>
  );
}
