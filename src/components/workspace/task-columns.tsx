"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CLUSTER_LABELS, NON_CLUSTER_LABELS, type ClusterAssignmentCode } from "@/lib/cluster-codes";
import { MEMBERSHIP_STATUS_LABELS } from "@/lib/membership-contracts";
import {
  CRM_TASK_OUTCOME_LABELS,
  CRM_TASK_STATUS_LABELS,
  CRM_TASK_TYPE_LABELS,
  type CrmTaskOutcome,
  type CrmTaskStatus,
} from "@/lib/workspace-contracts";
import type { WorkspaceTaskTab } from "@/lib/workspace-contracts";
import type { WorkspaceTaskRow } from "@/lib/workspace-types";
import { TaskRowActions } from "./task-row-actions";

function clusterLabel(code: ClusterAssignmentCode | null): string {
  if (!code) return "—";
  return (CLUSTER_LABELS as Record<string, string>)[code] ?? (NON_CLUSTER_LABELS as Record<string, string>)[code] ?? code;
}

/**
 * Warna badge cluster — lembut (soft), bukan warna pekat. Keluarga D/Dhp
 * dibedakan sesuai desain referensi (D-New hijau mint, Dhp-New biru); cluster
 * lain memakai netral supaya tabel tidak jadi terlalu ramai warna.
 */
const CLUSTER_TONE: Record<string, string> = {
  D_NEW: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
  D_OLD: "border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  DHP_NEW: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300",
  DHP_OLD: "border-blue-200 bg-blue-50/70 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
  NEEDS_REVIEW: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
};
const CLUSTER_TONE_DEFAULT = "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300";

/** Warna badge status task — soft, satu keluarga dengan warna KPI di atas. */
const STATUS_TONE: Record<CrmTaskStatus, string> = {
  UNASSIGNED: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  ASSIGNED: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300",
  IN_PROGRESS: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300",
  DONE: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
  CANCELLED: "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400",
};

const OUTCOME_TONE: Record<CrmTaskOutcome, string> = {
  NO_RESPONSE: CLUSTER_TONE_DEFAULT,
  CONTACTED: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300",
  INTERESTED: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300",
  NOT_INTERESTED: CLUSTER_TONE_DEFAULT,
  JOINED_GROUP: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
  CLOSING: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
  FOLLOW_UP_AGAIN: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  OTHER: CLUSTER_TONE_DEFAULT,
};

function SoftBadge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <Badge variant="outline" className={cn("whitespace-nowrap font-medium", tone)}>{children}</Badge>;
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

/**
 * Kolom tabel Pembagian Tugas. Nomor urut ("No.") dan kolom "Aksi" dirender di
 * sini (bukan disuntik DataTable) karena halaman ini memakai TaskTable sendiri
 * dengan paginasi klasik — lihat task-table.tsx.
 */
export function buildWorkspaceTaskColumns(opts: {
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  /** Offset baris halaman aktif supaya "No." menyambung antar halaman. */
  rowOffset: number;
  onView: (task: WorkspaceTaskRow) => void;
  onAssign: (task: WorkspaceTaskRow) => void;
  onSetStatus: (task: WorkspaceTaskRow) => void;
  onComplete: (task: WorkspaceTaskRow) => void;
  onEditNotes: (task: WorkspaceTaskRow) => void;
  onDelete: (task: WorkspaceTaskRow) => void;
  onRestore: (task: WorkspaceTaskRow) => void;
  onPermanentDelete: (task: WorkspaceTaskRow) => void;
  /** Tab aktif — menentukan kolom mana yang relevan ditampilkan. */
  tab: WorkspaceTaskTab;
}): ColumnDef<WorkspaceTaskRow, unknown>[] {
  const { selectedIds, onToggle, rowOffset, tab } = opts;
  return [
    {
      id: "select",
      size: 40,
      header: () => (
        <Checkbox
          checked={opts.allSelected}
          indeterminate={opts.someSelected && !opts.allSelected}
          onChange={opts.onToggleAll}
          aria-label="Pilih semua task yang dimuat"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.has(row.original.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggle(row.original.id)}
          aria-label={`Pilih task ${row.original.customerName}`}
        />
      ),
    },
    {
      id: "rowNumber",
      header: "No.",
      size: 48,
      cell: ({ row }) => <span className="tabular text-muted-foreground">{rowOffset + row.index + 1}</span>,
    },
    {
      id: "customerName",
      header: "Customer",
      size: 136,
      cell: ({ row }) => (
        <span className="font-medium text-primary underline-offset-4 group-hover/row:underline">{row.original.customerName}</span>
      ),
    },
    {
      // Nomor HP TIDAK PERNAH dipotong (truncate/ellipsis) — operator memakainya
      // untuk menghubungi customer, jadi harus terbaca utuh.
      id: "customerPhone",
      header: "No. HP",
      size: 120,
      cell: ({ row }) => <span className="tabular whitespace-nowrap">{row.original.customerPhone}</span>,
    },
    {
      id: "createdAt",
      header: "Tanggal Customer Baru",
      size: 116,
      cell: ({ row }) => (
        <span className="tabular whitespace-nowrap">{formatDate(row.original.firstOrderDate ?? row.original.createdAt)}</span>
      ),
    },
    {
      id: "firstProductName",
      header: "Produk Pertama",
      size: 96,
      cell: ({ row }) => (
        <span className="block truncate text-muted-foreground" title={row.original.firstProductName ?? undefined}>
          {row.original.firstProductName ?? "—"}
        </span>
      ),
    },
    {
      id: "firstOrderDivision",
      header: "Sumber",
      size: 88,
      cell: ({ row }) =>
        row.original.firstOrderDivision ? (
          <SoftBadge tone={CLUSTER_TONE_DEFAULT}>{row.original.firstOrderDivision}</SoftBadge>
        ) : (
          <Dash />
        ),
    },
    {
      id: "clusterCode",
      header: "Cluster",
      size: 92,
      cell: ({ row }) => {
        const code = row.original.clusterCode;
        if (!code) return <Dash />;
        return <SoftBadge tone={CLUSTER_TONE[code] ?? CLUSTER_TONE_DEFAULT}>{clusterLabel(code)}</SoftBadge>;
      },
    },
    {
      id: "membershipStatus",
      header: "Status Grup",
      size: 112,
      cell: ({ row }) => (
        <SoftBadge tone={CLUSTER_TONE_DEFAULT}>{MEMBERSHIP_STATUS_LABELS[row.original.membershipStatus]}</SoftBadge>
      ),
    },
    {
      id: "taskType",
      header: "Jenis Tugas",
      size: 138,
      cell: ({ row }) => (
        <span className="block truncate" title={CRM_TASK_TYPE_LABELS[row.original.taskType]}>
          {CRM_TASK_TYPE_LABELS[row.original.taskType]}
        </span>
      ),
    },
    {
      id: "picName",
      header: "PIC CRM",
      size: 94,
      cell: ({ row }) =>
        row.original.picName ? (
          <span className="block truncate" title={row.original.picName}>
            {row.original.picName}
          </span>
        ) : (
          <Dash />
        ),
    },
    {
      id: "dueAt",
      header: "Due Date",
      size: 88,
      cell: ({ row }) =>
        row.original.dueAt ? (
          <span
            className={cn(
              "tabular whitespace-nowrap",
              row.original.overdue && "flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400"
            )}
          >
            {row.original.overdue ? <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
            {formatDate(row.original.dueAt)}
          </span>
        ) : (
          <Dash />
        ),
    },
    {
      id: "status",
      header: "Status",
      size: 100,
      cell: ({ row }) => <SoftBadge tone={STATUS_TONE[row.original.status]}>{CRM_TASK_STATUS_LABELS[row.original.status]}</SoftBadge>,
    },
    {
      id: "outcome",
      header: "Outcome",
      size: 104,
      cell: ({ row }) =>
        row.original.outcome ? (
          <SoftBadge tone={OUTCOME_TONE[row.original.outcome]}>{CRM_TASK_OUTCOME_LABELS[row.original.outcome]}</SoftBadge>
        ) : (
          <Dash />
        ),
    },
    ...(tab === "trash"
      ? ([
          {
            id: "deletedAt",
            header: "Dihapus Pada",
            size: 112,
            cell: ({ row }) => <span className="tabular whitespace-nowrap">{formatDate(row.original.deletedAt)}</span>,
          },
        ] as ColumnDef<WorkspaceTaskRow, unknown>[])
      : []),
    // Kolom Catatan hanya di tab Completed — di sanalah catatan perkembangan
    // ("masih negosiasi" / "sudah dibayar") jadi informasi utama yang dibaca.
    ...(tab === "completed"
      ? ([
          {
            id: "notes",
            header: "Catatan",
            size: 180,
            cell: ({ row }) =>
              row.original.notes ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    opts.onEditNotes(row.original);
                  }}
                  title={row.original.notes}
                  className="block w-full truncate text-left underline-offset-4 hover:underline"
                >
                  {row.original.notes}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    opts.onEditNotes(row.original);
                  }}
                  className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  + Tambah catatan
                </button>
              ),
          },
        ] as ColumnDef<WorkspaceTaskRow, unknown>[])
      : []),
    {
      id: "actions",
      header: "",
      size: 44,
      cell: ({ row }) => (
        <TaskRowActions
          task={row.original}
          onView={opts.onView}
          onAssign={opts.onAssign}
          onSetStatus={opts.onSetStatus}
          onComplete={opts.onComplete}
          onEditNotes={opts.onEditNotes}
          onDelete={opts.onDelete}
          trashMode={tab === "trash"}
          onRestore={opts.onRestore}
          onPermanentDelete={opts.onPermanentDelete}
        />
      ),
    },
  ];
}
