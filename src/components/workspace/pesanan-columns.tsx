"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectAllCheckbox } from "@/components/data-table/select-all-checkbox";
import type { WorkspaceOrderRow, WorkspaceOrderStatus } from "@/lib/workspace-pesanan-contracts";
import { formatDate, formatRupiah } from "@/lib/format";

export const STATUS_VARIANT: Record<WorkspaceOrderStatus, "secondary" | "success" | "outline" | "warning"> = {
  DRAFT: "outline",
  CONFIRMED: "success",
  CANCELLED: "secondary",
  RETURNED: "warning",
  REFUNDED: "warning",
  PARTIALLY_REFUNDED: "warning",
};

export function buildPesananColumns(opts: {
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  onView: (id: number) => void;
}): ColumnDef<WorkspaceOrderRow, any>[] {
  const { selectedIds, onToggle, onView } = opts;
  return [
    {
      id: "select",
      header: () => (
        <SelectAllCheckbox
          allSelected={opts.allSelected}
          someSelected={opts.someSelected}
          onToggle={opts.onToggleAll}
          ariaLabel="Pilih semua pesanan yang dimuat"
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
          aria-label={`Pilih pesanan ${row.original.orderNumber}`}
        />
      ),
    },
    { accessorKey: "orderDate", header: "Tanggal", size: 95, cell: ({ getValue }) => formatDate(getValue()) },
    {
      accessorKey: "sourceOrderId",
      header: "No Order",
      size: 110,
      cell: ({ getValue }) => {
        const value = getValue();
        return value ? <span className="tabular">{value}</span> : <span className="text-muted-foreground">—</span>;
      },
    },
    { accessorKey: "customerName", header: "Nama Customer", size: 170 },
    { accessorKey: "phoneDisplay", header: "Nomor HP", size: 130 },
    { accessorKey: "crmNameSnapshot", header: "Nama CRM", size: 150 },
    {
      accessorKey: "productsSummary",
      header: "Ringkasan Produk",
      size: 260,
      cell: ({ getValue }) => <span className="whitespace-pre-line">{getValue()}</span>,
    },
    { accessorKey: "totalQty", header: "Total QTY", size: 80, cell: ({ getValue }) => <span className="tabular">{getValue()}</span> },
    { accessorKey: "totalSalesValue", header: "Total Sales", size: 120, cell: ({ getValue }) => <span className="tabular">{formatRupiah(getValue())}</span> },
    { accessorKey: "cos", header: "COS", size: 110, cell: ({ getValue }) => <span className="tabular">{formatRupiah(getValue())}</span> },
    { accessorKey: "paymentMethod", header: "Pembayaran", size: 100 },
    { accessorKey: "orderTotal", header: "TOTAL", size: 120, cell: ({ getValue }) => <span className="tabular font-medium">{formatRupiah(getValue())}</span> },
    { accessorKey: "status", header: "Status", size: 100, cell: ({ getValue }) => <Badge variant={STATUS_VARIANT[getValue() as WorkspaceOrderStatus]}>{getValue()}</Badge> },
    { accessorKey: "sourceType", header: "Sumber Data", size: 100 },
    {
      id: "actions",
      header: "Aksi",
      size: 90,
      enableResizing: false,
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={(e) => {
            e.stopPropagation();
            onView(row.original.id);
          }}
        >
          Lihat
        </Button>
      ),
    },
  ];
}
