"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Pencil } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { clusterLabel } from "@/components/customer/customer-columns";
import { GroupMemberDetailSheet } from "@/components/customer/group-member-detail-sheet";
import { formatDate } from "@/lib/format";
import { GROUP_SOURCE_LABELS, type GroupMemberRow } from "@/lib/group-membership-types";
import { cn } from "@/lib/utils";

const SOURCE_TONE: Record<string, string> = {
  Import: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300",
  Manual: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
  Legacy: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
};

/** Daftar Member Grup — klik baris membuka panel detail di kanan. */
export function GroupMemberTable({
  rows,
  rowNumberOffset,
  picOptions,
  groupOptions,
}: {
  rows: GroupMemberRow[];
  rowNumberOffset: number;
  picOptions: { id: number; name: string }[];
  groupOptions: string[];
}) {
  const router = useRouter();
  const [detailId, setDetailId] = React.useState<number | null>(null);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());

  React.useEffect(() => {
    setSelected(new Set());
  }, [rows]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.customerId));
  const someSelected = selected.size > 0;
  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const semua = rows.length > 0 && rows.every((r) => prev.has(r.customerId));
      return semua ? new Set() : new Set(rows.map((r) => r.customerId));
    });
  }, [rows]);

  const columns = React.useMemo<ColumnDef<GroupMemberRow, unknown>[]>(
    () => [
      {
        id: "select",
        size: 44,
        minSize: 44,
        maxSize: 44,
        enableResizing: false,
        header: () => (
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            onChange={toggleAll}
            aria-label="Pilih semua member yang dimuat"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selected.has(row.original.customerId)}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggle(row.original.customerId)}
            aria-label={`Pilih member ${row.original.displayName}`}
          />
        ),
      },
      {
        id: "phone",
        header: "No HP",
        size: 140,
        // Nomor HP tampil PENUH — tidak dipotong, tidak jadi notasi ilmiah.
        cell: ({ row }) => <span className="whitespace-nowrap font-mono">{row.original.normalizedPhone}</span>,
      },
      { id: "name", header: "Nama Customer", size: 170, cell: ({ row }) => <span className="truncate">{row.original.displayName}</span> },
      {
        id: "cluster",
        header: "Current Cluster",
        size: 120,
        // READ-ONLY: cluster berasal dari cluster engine, tidak bisa diubah di sini.
        cell: ({ row }) => <Badge variant="outline">{clusterLabel(row.original.clusterCode)}</Badge>,
      },
      {
        id: "groupName",
        header: "Nama Grup",
        size: 170,
        cell: ({ row }) => row.original.groupName ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: "pic",
        header: "PIC",
        size: 110,
        cell: ({ row }) => row.original.picName ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: "joinedAt",
        header: "Tanggal Masuk Grup",
        size: 140,
        // Membership legacy memang belum punya tanggal — ditampilkan apa adanya.
        cell: ({ row }) =>
          row.original.joinedAt ? formatDate(row.original.joinedAt) : <span className="text-muted-foreground">—</span>,
      },
      {
        id: "lastOrder",
        header: "Last Order",
        size: 120,
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.lastOrderDate)}</span>,
      },
      {
        id: "source",
        header: "Sumber Update",
        size: 120,
        cell: ({ row }) => {
          const label = GROUP_SOURCE_LABELS[row.original.source];
          return (
            <Badge variant="outline" className={cn("font-medium", SOURCE_TONE[label])}>
              {label}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: "Aksi",
        size: 82,
        enableResizing: false,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Lihat detail ${row.original.displayName}`}
              onClick={(e) => {
                e.stopPropagation();
                setDetailId(row.original.customerId);
              }}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Edit membership ${row.original.displayName}`}
              onClick={(e) => {
                e.stopPropagation();
                setDetailId(row.original.customerId);
              }}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [selected, allSelected, someSelected, toggleAll]
  );

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.customerId}
        loading={false}
        hasMore={false}
        onLoadMore={() => {}}
        height={560}
        rowHeight={44}
        emptyMessage="Belum ada customer yang masuk Grup Konsultasi."
        rowNumberOffset={rowNumberOffset}
        onRowClick={(row) => setDetailId(row.customerId)}
      />
      <GroupMemberDetailSheet
        customerId={detailId}
        picOptions={picOptions}
        groupOptions={groupOptions}
        onClose={() => setDetailId(null)}
        onChanged={() => router.refresh()}
      />
    </>
  );
}
