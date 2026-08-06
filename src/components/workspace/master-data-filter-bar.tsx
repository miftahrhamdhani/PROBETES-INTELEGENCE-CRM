"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PendingIndicator } from "@/components/ui/pending-indicator";
import { WORKSPACE_PRODUCT_USAGES } from "@/lib/workspace-master-data-contracts";
import { useUrlFilterUpdater } from "./use-url-filter";

const USAGE_LABEL: Record<string, string> = {
  SELLABLE: "Sellable",
  BONUS_ONLY: "Bonus Only",
  SELLABLE_AND_BONUS: "Sellable + Bonus",
  INACTIVE: "Inactive",
};

/**
 * Filter Master Data — seluruhnya server-side lewat URL query (§E.2), supaya
 * pencarian tidak bergantung pada baris yang kebetulan sudah ada di browser
 * dan hasilnya konsisten dengan pagination.
 */
export function MasterDataFilterBar({
  defaults,
}: {
  defaults: { search?: string; productUsage?: string; includeInactive?: string };
}) {
  const update = useUrlFilterUpdater();
  const [search, setSearch] = React.useState(defaults.search ?? "");

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Cari produk</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && update({ search: search || null })}
            onBlur={() => update({ search: search || null })}
            placeholder="Product ID atau nama..."
            className="h-8 w-56 pl-7 text-xs"
          />
        </div>
      </label>
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Jenis Produk</span>
        <select
          defaultValue={defaults.productUsage ?? ""}
          onChange={(event) => update({ productUsage: event.target.value || null })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">Semua</option>
          {WORKSPACE_PRODUCT_USAGES.map((usage) => (
            <option key={usage} value={usage}>
              {USAGE_LABEL[usage] ?? usage}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Status</span>
        <select
          defaultValue={defaults.includeInactive ?? "true"}
          onChange={(event) => update({ includeInactive: event.target.value })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="true">Semua status</option>
          <option value="">Hanya aktif</option>
        </select>
      </label>
      <PendingIndicator show={update.isPending} />
    </div>
  );
}
