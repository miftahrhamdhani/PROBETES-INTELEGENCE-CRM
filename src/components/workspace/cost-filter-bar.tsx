"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Plus, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkspaceDateRangePicker } from "@/components/ui/date-range-picker";
import { PendingIndicator } from "@/components/ui/pending-indicator";
import { WORKSPACE_COST_CATEGORIES, WORKSPACE_COST_CATEGORY_LABEL, WORKSPACE_COST_STATUSES, WORKSPACE_COST_STATUS_LABEL } from "@/lib/workspace-cost-contracts";
import { useUrlFilterUpdater } from "./use-url-filter";
import { cn } from "@/lib/utils";

const ALL = "__ALL__";

function LabeledField({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("grid min-w-0 gap-1.5 text-[11px] font-medium text-slate-600", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function CostFilterBar({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  const searchParams = useSearchParams();
  const update = useUrlFilterUpdater();
  const [search, setSearch] = React.useState(searchParams.get("search") ?? "");

  React.useEffect(() => setSearch(searchParams.get("search") ?? ""), [searchParams]);

  React.useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (current === search) return;
    const timeout = window.setTimeout(() => update({ search: search || null }), 350);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function reset() {
    setSearch("");
    update({ from: null, to: null, category: null, status: null, search: null, sort: null, order: null }, { resetPage: true });
  }

  const hasFilters = ["from", "to", "category", "status", "search"].some((key) => searchParams.has(key));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <LabeledField label="Rentang Tanggal">
          <WorkspaceDateRangePicker from={searchParams.get("from")} to={searchParams.get("to")} onChange={(range) => update({ from: range.from, to: range.to })} />
        </LabeledField>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:flex xl:flex-1 xl:items-end">
          <LabeledField label="Kategori COM" className="xl:w-48">
            <Select value={searchParams.get("category") ?? ALL} onValueChange={(value) => update({ category: value === ALL ? null : value })}>
              <SelectTrigger aria-label="Kategori COM"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua Kategori</SelectItem>
                {WORKSPACE_COST_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{WORKSPACE_COST_CATEGORY_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField label="Status" className="xl:w-52">
            <Select value={searchParams.get("status") ?? ALL} onValueChange={(value) => update({ status: value === ALL ? null : value })}>
              <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua Status</SelectItem>
                {WORKSPACE_COST_STATUSES.map((s) => <SelectItem key={s} value={s}>{WORKSPACE_COST_STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField label="Cari Nama Biaya" className="col-span-2 sm:col-span-2 xl:max-w-xs xl:flex-1">
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama biaya, vendor, atau no. referensi..."
                aria-label="Cari Nama Biaya"
                className="h-9 pl-9"
              />
            </span>
          </LabeledField>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-4 xl:ml-auto xl:flex-none">
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 whitespace-nowrap" onClick={reset} disabled={!hasFilters && !search}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset
            </Button>
            {canCreate ? (
              <Button type="button" size="sm" className="h-9 gap-1.5 whitespace-nowrap" onClick={onCreate}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Tambah Biaya
              </Button>
            ) : null}
            <PendingIndicator show={update.isPending} />
          </div>
        </div>
      </div>
    </div>
  );
}
