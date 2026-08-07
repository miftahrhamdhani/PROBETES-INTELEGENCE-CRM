"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AlertCircle, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PendingIndicator } from "@/components/ui/pending-indicator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import {
  CRM_TASK_OUTCOMES,
  CRM_TASK_OUTCOME_LABELS,
  CRM_TASK_STATUS_LABELS,
  CRM_TASK_TYPES,
  CRM_TASK_TYPE_LABELS,
  WORKSPACE_TASK_TAB_STATUSES,
  type WorkspaceTaskTab,
} from "@/lib/workspace-contracts";
import type { CrmUserOption } from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

/** Nilai sentinel untuk opsi "semua" — Radix Select melarang SelectItem
 *  bernilai string kosong, sedangkan URL memakai "tidak ada param" untuk
 *  keadaan yang sama. Konversi dua arahnya ditangani di readParam/updateParam. */
const ALL = "__ALL__";

function LabeledField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * Filter Workspace > Pembagian Tugas — seluruh state tetap di URL query string
 * (bisa di-bookmark), server-side, persis seperti sebelumnya. Yang berubah
 * hanya tampilannya: tiap field kini punya label di atas input dan tersusun
 * satu baris di desktop.
 *
 * `onAddTask` diberikan TaskManager (pemilik AddTaskDialog) supaya tombol
 * "+ Tambah Tugas" bisa berdiri di ujung kanan panel filter sesuai desain,
 * tanpa memindahkan kepemilikan dialog/actions-nya.
 */
export function TaskSearchFilter({
  picOptions,
  onAddTask,
  tab = "task",
}: {
  picOptions: CrmUserOption[];
  onAddTask?: () => void;
  /** Tab aktif — opsi dropdown Status dibatasi ke status milik tab itu saja. */
  tab?: WorkspaceTaskTab;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  const [search, setSearch] = React.useState(searchParams.get("search") ?? "");

  React.useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
  }, [searchParams]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  const readParam = React.useCallback((key: string) => searchParams.get(key) || ALL, [searchParams]);

  React.useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (search === current) return;
    const timeout = setTimeout(() => updateParam("search", search), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const overdueOnly = searchParams.get("overdue") === "1";

  return (
    <div className="rounded-xl border border-slate-200 bg-card p-4 shadow-sm dark:border-slate-800">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <LabeledField label="Cari pelanggan atau nomor HP" className="min-w-0 flex-1 xl:max-w-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ketik nama atau nomor HP..."
              aria-label="Cari pelanggan atau nomor HP"
              className="pl-8"
            />
          </div>
        </LabeledField>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:flex xl:flex-1 xl:items-end">
          <LabeledField label="PIC CRM" className="xl:w-40">
            <Select value={readParam("pic")} onValueChange={(value) => updateParam("pic", value)}>
              <SelectTrigger aria-label="Filter PIC CRM">
                <SelectValue placeholder="Semua PIC" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua PIC</SelectItem>
                <SelectItem value="UNASSIGNED">Belum Dibagi</SelectItem>
                {picOptions.map((pic) => (
                  <SelectItem key={pic.id} value={String(pic.id)}>
                    {pic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>

          {/* Tab yang cuma punya SATU status (Task, Completed) tidak perlu
              dropdown Status — pilihannya sudah pasti. Hanya Broadcast
              (ASSIGNED + IN_PROGRESS) yang menampilkannya. */}
          {WORKSPACE_TASK_TAB_STATUSES[tab].length > 1 ? (
            <LabeledField label="Status" className="xl:w-40">
              <Select value={readParam("status")} onValueChange={(value) => updateParam("status", value)}>
                <SelectTrigger aria-label="Filter Status">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Semua Status</SelectItem>
                  {WORKSPACE_TASK_TAB_STATUSES[tab].map((status) => (
                    <SelectItem key={status} value={status}>
                      {CRM_TASK_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabeledField>
          ) : null}

          <LabeledField label="Jenis Tugas" className="xl:w-44">
            <Select value={readParam("taskType")} onValueChange={(value) => updateParam("taskType", value)}>
              <SelectTrigger aria-label="Filter Jenis Tugas">
                <SelectValue placeholder="Semua Jenis Tugas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua Jenis Tugas</SelectItem>
                {CRM_TASK_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {CRM_TASK_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>

          <LabeledField label="Outcome" className="xl:w-44">
            <Select value={readParam("outcome")} onValueChange={(value) => updateParam("outcome", value)}>
              <SelectTrigger aria-label="Filter Outcome">
                <SelectValue placeholder="Semua Outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua Outcome</SelectItem>
                {CRM_TASK_OUTCOMES.map((outcome) => (
                  <SelectItem key={outcome} value={outcome}>
                    {CRM_TASK_OUTCOME_LABELS[outcome]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>

          <LabeledField label="Rentang Tanggal" className="col-span-2 sm:col-span-1 xl:w-auto">
            <DateRangeFilter />
          </LabeledField>

          <div className="flex items-end gap-2 xl:ml-auto">
            <button
              type="button"
              onClick={() => updateParam("overdue", overdueOnly ? "" : "1")}
              aria-pressed={overdueOnly}
              className={cn(
                "flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-xs transition-colors",
                overdueOnly
                  ? "border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                  : "bg-card hover:bg-accent"
              )}
            >
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Hanya Overdue
            </button>
            {onAddTask && tab !== "trash" ? (
              <Button type="button" size="sm" className="h-9 gap-1.5 whitespace-nowrap" onClick={onAddTask}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Tambah Tugas
              </Button>
            ) : null}
            <PendingIndicator show={isPending} />
          </div>
        </div>
      </div>
    </div>
  );
}
