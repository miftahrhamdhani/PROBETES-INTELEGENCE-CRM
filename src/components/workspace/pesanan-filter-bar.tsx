"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { WorkspaceDateRangePicker } from "@/components/ui/date-range-picker";
import { PendingIndicator } from "@/components/ui/pending-indicator";
import type { WorkspacePesananTab } from "@/lib/workspace-pesanan-contracts";
import { useUrlFilterUpdater } from "./use-url-filter";

export function PesananFilterBar({
  defaults,
  crmOptions,
  tab = "semua",
}: {
  defaults: { from?: string; to?: string; customer?: string; crmUserId?: string; status?: string };
  crmOptions: { id: number; name: string }[];
  tab?: WorkspacePesananTab;
}) {
  const update = useUrlFilterUpdater();
  const [customer, setCustomer] = React.useState(defaults.customer ?? "");

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
      <WorkspaceDateRangePicker
        from={defaults.from ?? null}
        to={defaults.to ?? null}
        onChange={(range) => update({ from: range.from, to: range.to })}
      />
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Nama Customer / No HP</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && update({ customer: customer || null })}
            onBlur={() => update({ customer: customer || null })}
            placeholder="Cari customer..."
            className="h-8 w-52 pl-7 text-xs"
          />
        </div>
      </label>
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Nama CRM</span>
        <Combobox
          value={defaults.crmUserId ?? null}
          onChange={(value) => update({ crmUserId: value })}
          options={[{ value: "", label: "Semua CRM" }, ...crmOptions.map((c) => ({ value: String(c.id), label: c.name }))]}
          placeholder="Semua CRM"
          className="w-44"
        />
      </label>
      {/* Dropdown Status HANYA muncul di tab Retur & Refund — tab "draft" dan
          "semua" masing-masing sudah jadi bucket satu status (DRAFT / CONFIRMED),
          jadi filter tambahan di situ tidak ada gunanya (lihat buildOrderConditions). */}
      {tab === "retur_refund" ? (
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Status</span>
          <select
            defaultValue={defaults.status ?? ""}
            onChange={(e) => update({ status: e.target.value || null })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Semua</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="RETURNED">RETURNED</option>
            <option value="REFUNDED">REFUNDED</option>
            <option value="PARTIALLY_REFUNDED">PARTIALLY_REFUNDED</option>
          </select>
        </label>
      ) : null}
      <PendingIndicator show={update.isPending} />
    </div>
  );
}
