"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SelectAllCheckbox } from "@/components/data-table/select-all-checkbox";
import { formatDate } from "@/lib/format";
import { CLUSTER_LABELS, NON_CLUSTER_LABELS, type ClusterAssignmentCode } from "@/lib/cluster-codes";
import { MEMBERSHIP_STATUS_LABELS } from "@/lib/membership-contracts";
import {
  CRM_TASK_OUTCOME_LABELS,
  CRM_TASK_STATUS_LABELS,
  CRM_TASK_TYPE_LABELS,
  type CrmTaskOutcome,
  type CrmTaskStatus,
} from "@/lib/workspace-contracts";
import type { WorkspaceTaskRow } from "@/lib/workspace-types";

function clusterLabel(code: ClusterAssignmentCode | null): string {
  if (!code) return "—";
  return (CLUSTER_LABELS as Record<string, string>)[code] ?? (NON_CLUSTER_LABELS as Record<string, string>)[code] ?? code;
}

const STATUS_VARIANT: Record<CrmTaskStatus, "default" | "secondary" | "outline" | "warning" | "success"> = {
  UNASSIGNED: "outline",
  ASSIGNED: "secondary",
  IN_PROGRESS: "warning",
  DONE: "success",
  CANCELLED: "outline",
};

const OUTCOME_VARIANT: Record<CrmTaskOutcome, "default" | "secondary" | "outline" | "warning" | "success"> = {
  NO_RESPONSE: "outline",
  CONTACTED: "secondary",
  INTERESTED: "secondary",
  NOT_INTERESTED: "outline",
  JOINED_GROUP: "success",
  CLOSING: "success",
  FOLLOW_UP_AGAIN: "warning",
  OTHER: "outline",
};

export function buildWorkspaceTaskColumns(opts: {
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
}): ColumnDef<WorkspaceTaskRow, any>[] {
  const { selectedIds, onToggle } = opts;
  return [
    {
      id: "select",
      header: () => (
        <SelectAllCheckbox
          allSelected={opts.allSelected}
          someSelected={opts.someSelected}
          onToggle={opts.onToggleAll}
          ariaLabel="Pilih semua task yang dimuat"
        />
      ),
      size: 36,
      minSize: 36,
      maxSize: 36,
      enableResizing: false,
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 cursor-pointer accent-primary"
          checked={selectedIds.has(row.original.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggle(row.original.id)}
          aria-label={`Pilih task ${row.original.id}`}
        />
      ),
    },
    {
      id: "customerName",
      header: "Customer",
      size: 180,
      cell: ({ row }) => <span className="font-medium text-primary">{row.original.customerName}</span>,
    },
    {
      id: "customerPhone",
      header: "No HP",
      size: 140,
      cell: ({ row }) => <span className="tabular">{row.original.customerPhone}</span>,
    },
    {
      id: "createdAt",
      header: "Tanggal Customer Baru",
      size: 120,
      cell: ({ row }) => <span className="tabular">{formatDate(row.original.firstOrderDate ?? row.original.createdAt)}</span>,
    },
    {
      id: "firstProductName",
      header: "Produk Pertama",
      size: 160,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.firstProductName ?? "—"}</span>,
    },
    {
      id: "clusterCode",
      header: "Cluster",
      size: 90,
      cell: ({ row }) => <Badge variant="outline">{clusterLabel(row.original.clusterCode)}</Badge>,
    },
    {
      id: "membershipStatus",
      header: "Status Grup",
      size: 130,
      cell: ({ row }) => <span className="text-muted-foreground">{MEMBERSHIP_STATUS_LABELS[row.original.membershipStatus]}</span>,
    },
    {
      id: "taskType",
      header: "Jenis Tugas",
      size: 170,
      cell: ({ row }) => <span>{CRM_TASK_TYPE_LABELS[row.original.taskType]}</span>,
    },
    {
      id: "picName",
      header: "PIC CRM",
      size: 130,
      cell: ({ row }) => <span>{row.original.picName ?? "—"}</span>,
    },
    {
      id: "dueAt",
      header: "Due Date",
      size: 110,
      cell: ({ row }) =>
        row.original.dueAt ? (
          <span className={row.original.overdue ? "flex items-center gap-1 font-medium text-destructive" : "tabular"}>
            {row.original.overdue ? <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
            {formatDate(row.original.dueAt)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      size: 110,
      cell: ({ row }) => <Badge variant={STATUS_VARIANT[row.original.status]}>{CRM_TASK_STATUS_LABELS[row.original.status]}</Badge>,
    },
    {
      id: "outcome",
      header: "Outcome",
      size: 140,
      cell: ({ row }) =>
        row.original.outcome ? (
          <Badge variant={OUTCOME_VARIANT[row.original.outcome]}>{CRM_TASK_OUTCOME_LABELS[row.original.outcome]}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "notes",
      header: "Catatan",
      size: 200,
      cell: ({ row }) => (
        <span className="text-muted-foreground" title={row.original.notes ?? undefined}>
          {row.original.notes ?? "—"}
        </span>
      ),
    },
  ];
}
