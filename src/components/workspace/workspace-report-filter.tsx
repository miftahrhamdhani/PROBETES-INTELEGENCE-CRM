"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import {
  CRM_TASK_OUTCOMES,
  CRM_TASK_OUTCOME_LABELS,
  CRM_TASK_STATUSES,
  CRM_TASK_STATUS_LABELS,
  CRM_TASK_TYPES,
  CRM_TASK_TYPE_LABELS,
} from "@/lib/workspace-contracts";
import type { CrmUserOption } from "@/lib/workspace-types";

/** Filter Workspace > Laporan Kerja — search + rentang tanggal laporan + filter
 *  yang hanya berlaku untuk laporan tertaut task (PIC/jenis tugas/status/outcome). */
export function WorkspaceReportFilter({
  picOptions,
  platformOptions,
}: {
  picOptions: CrmUserOption[];
  platformOptions: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(searchParams.get("search") ?? "");

  React.useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
  }, [searchParams]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  React.useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (search === current) return;
    const timeout = setTimeout(() => updateParam("search", search), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau nomor HP" className="pl-8" />
      </label>
      <DateRangeFilter paramFrom="reportFrom" paramTo="reportTo" />
      <select
        aria-label="Filter PIC"
        className="h-9 rounded-md border bg-card px-3 text-xs"
        value={searchParams.get("pic") ?? ""}
        onChange={(e) => updateParam("pic", e.target.value)}
      >
        <option value="">Semua PIC</option>
        {picOptions.map((pic) => (
          <option key={pic.id} value={pic.id}>
            {pic.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter Jenis Tugas"
        className="h-9 rounded-md border bg-card px-3 text-xs"
        value={searchParams.get("taskType") ?? ""}
        onChange={(e) => updateParam("taskType", e.target.value)}
      >
        <option value="">Semua Jenis Tugas</option>
        {CRM_TASK_TYPES.map((type) => (
          <option key={type} value={type}>
            {CRM_TASK_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter Status Tugas"
        className="h-9 rounded-md border bg-card px-3 text-xs"
        value={searchParams.get("taskStatus") ?? ""}
        onChange={(e) => updateParam("taskStatus", e.target.value)}
      >
        <option value="">Semua Status</option>
        {CRM_TASK_STATUSES.map((status) => (
          <option key={status} value={status}>
            {CRM_TASK_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter Outcome"
        className="h-9 rounded-md border bg-card px-3 text-xs"
        value={searchParams.get("outcome") ?? ""}
        onChange={(e) => updateParam("outcome", e.target.value)}
      >
        <option value="">Semua Outcome</option>
        {CRM_TASK_OUTCOMES.map((outcome) => (
          <option key={outcome} value={outcome}>
            {CRM_TASK_OUTCOME_LABELS[outcome]}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter Platform"
        className="h-9 rounded-md border bg-card px-3 text-xs"
        value={searchParams.get("platform") ?? ""}
        onChange={(e) => updateParam("platform", e.target.value)}
      >
        <option value="">Semua Platform</option>
        {platformOptions.map((platform) => (
          <option key={platform} value={platform}>
            {platform}
          </option>
        ))}
      </select>
    </div>
  );
}
