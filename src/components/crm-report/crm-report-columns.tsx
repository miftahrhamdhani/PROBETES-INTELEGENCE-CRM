"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Archive, ArchiveRestore, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDate, formatRupiah } from "@/lib/format";
import { CRM_TASK_STATUS_LABELS, CRM_TASK_TYPE_LABELS, CRM_TASK_OUTCOME_LABELS } from "@/lib/workspace-contracts";
import type { CrmTaskOutcome, CrmTaskStatus, CrmTaskType } from "@/lib/workspace-contracts";
import type { CrmReportRow } from "@/lib/crm-report-types";

/** `showTaskColumns` = true di Workspace > Laporan Kerja (menampilkan Jenis
 *  Tugas/Status/Outcome/PIC dari task yang tertaut) — Input Kerja (form entry
 *  cepat) tidak menampilkannya karena kebanyakan laporan belum tertaut task. */
export function buildCrmReportColumns(
  onArchiveToggle: (row: CrmReportRow) => void,
  showTaskColumns = false
): ColumnDef<CrmReportRow, any>[] {
  const taskColumns: ColumnDef<CrmReportRow, any>[] = showTaskColumns
    ? [
        {
          id: "taskType",
          header: "Jenis Tugas",
          size: 160,
          cell: ({ row }) =>
            row.original.taskType ? (
              <span>{CRM_TASK_TYPE_LABELS[row.original.taskType as CrmTaskType] ?? row.original.taskType}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          id: "taskStatus",
          header: "Status Tugas",
          size: 110,
          cell: ({ row }) =>
            row.original.taskStatus ? (
              <Badge variant="outline">{CRM_TASK_STATUS_LABELS[row.original.taskStatus as CrmTaskStatus] ?? row.original.taskStatus}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          id: "taskOutcome",
          header: "Outcome",
          size: 140,
          cell: ({ row }) =>
            row.original.taskOutcome ? (
              <Badge variant="secondary">{CRM_TASK_OUTCOME_LABELS[row.original.taskOutcome as CrmTaskOutcome] ?? row.original.taskOutcome}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          id: "taskPicName",
          header: "PIC CRM",
          size: 130,
          cell: ({ row }) => <span>{row.original.taskPicName ?? "—"}</span>,
        },
      ]
    : [];

  return [
    {
      id: "reportDate",
      header: "Tanggal",
      size: 110,
      cell: ({ row }) => <span className="tabular">{formatDate(row.original.reportDate)}</span>,
    },
    {
      id: "customerName",
      header: "Nama Konsumen",
      size: 180,
      cell: ({ row }) => <span className="font-medium text-primary">{row.original.customerName}</span>,
    },
    {
      id: "phone",
      header: "No HP",
      size: 150,
      cell: ({ row }) => <span className="tabular">{row.original.phone}</span>,
    },
    {
      id: "city",
      header: "Kota",
      size: 130,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.city ?? "—"}</span>,
    },
    {
      id: "items",
      header: "Produk",
      size: 260,
      cell: ({ row }) => (
        <span className="text-muted-foreground" title={row.original.itemsSummary}>
          {row.original.itemsSummary}
        </span>
      ),
    },
    {
      id: "totalPayment",
      header: "Total Bayar",
      size: 140,
      cell: ({ row }) => <span className="font-medium tabular">{formatRupiah(row.original.totalPayment)}</span>,
    },
    {
      id: "csName",
      header: "CS",
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.csName ?? "—"}</span>,
    },
    {
      id: "advName",
      header: "ADV",
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.advName ?? "—"}</span>,
    },
    {
      id: "platform",
      header: "Platform",
      size: 120,
      cell: ({ row }) => (row.original.platform ? <Badge variant="outline">{row.original.platform}</Badge> : <span className="text-muted-foreground">—</span>),
    },
    {
      id: "division",
      header: "Divisi",
      size: 110,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.division ?? "—"}</span>,
    },
    {
      id: "salesType",
      header: "Type Sales",
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.salesType ?? "—"}</span>,
    },
    ...taskColumns,
    {
      id: "actions",
      header: "",
      size: 48,
      enableResizing: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => e.stopPropagation()} aria-label="Aksi lain">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => onArchiveToggle(row.original)}>
              {row.original.archivedAt ? (
                <>
                  <ArchiveRestore className="h-3.5 w-3.5" /> Aktifkan
                </>
              ) : (
                <>
                  <Archive className="h-3.5 w-3.5" /> Arsipkan
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}
