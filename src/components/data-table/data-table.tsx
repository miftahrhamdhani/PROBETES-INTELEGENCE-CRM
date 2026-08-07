"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { type ColumnDef, type VisibilityState, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function rectanglesIntersect(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number }
) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export interface DataTableProps<T> {
  /** Kolom data — nomor baris ditambahkan otomatis oleh DataTable, jangan sertakan di sini. */
  columns: ColumnDef<T, any>[];
  /** Seluruh baris yang sudah di-load sejauh ini (akumulasi infinite scroll), urutan dari server. */
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  emptyMessage?: string;
  /** Tinggi viewport tabel (px) — sisa baris di-virtualisasi, tidak semua di-render sekaligus. */
  height?: number;
  rowHeight?: number;
  onRowClick?: (row: T) => void;
  /** Klik kanan pada baris — dipakai menu Copy/Edit/Masukkan ke Pembagian Tugas
   *  (Customers, Customer Cluster). preventDefault dipanggil di sini supaya
   *  pemanggil tidak perlu mengulang boilerplate itu di tiap tabel. */
  onRowContextMenu?: (row: T, event: React.MouseEvent<HTMLTableRowElement>) => void;
  /** Aktifkan drag-selection pada tabel tertentu. Hanya baris yang sedang dirender
   *  virtualizer yang dapat tersentuh; pemanggil tetap memiliki state kandidat. */
  marqueeSelection?: {
    candidateIds: ReadonlySet<string>;
    onCandidateIdsChange: (ids: Set<string>) => void;
  };
  /** "Tampilan Kolom" — show/hide kolom opsional. Kolom wajib (mis. No HP, Nama,
   *  Cluster, Status Grup, Aksi) tidak boleh dimasukkan ke sini oleh pemanggil. */
  columnVisibility?: VisibilityState;
}

/**
 * Tabel data generik: nomor baris kontinu (index dalam array = urutan filter server),
 * kolom resizable (drag border kanan header), infinite scroll (memicu onLoadMore saat
 * mendekati baris terakhir yang sudah di-render), dan virtualized rendering (hanya
 * baris yang terlihat di-mount ke DOM) — dipakai semua tabel data besar di aplikasi ini
 * (Customers, Group Membership, Customer Cluster, CRM Report).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  hasMore,
  onLoadMore,
  emptyMessage = "Tidak ada data yang cocok dengan filter ini.",
  height = 560,
  rowHeight = 38,
  onRowClick,
  onRowContextMenu,
  marqueeSelection,
  columnVisibility,
}: DataTableProps<T>) {
  const numberedColumns = React.useMemo<ColumnDef<T, any>[]>(() => {
    const rowNumberColumn: ColumnDef<T, any> = {
      id: "__rowNumber",
      header: "No.",
      size: 56,
      minSize: 44,
      maxSize: 90,
      enableResizing: false,
      cell: ({ row }) => <span className="tabular text-muted-foreground">{row.index + 1}</span>,
    };
    // Kolom checkbox ("select") harus jadi kolom TERLUAR (paling kiri) — "No."
    // disisipkan SETELAHNYA, bukan selalu di depan. Tanpa ini "No." menyalip
    // checkbox dan urutannya jadi No./checkbox/data, beda dari pola Pembagian
    // Tugas (checkbox/No./data) yang jadi acuan desain tabel customer.
    const selectIndex = columns.findIndex((c) => c.id === "select");
    if (selectIndex === -1) return [rowNumberColumn, ...columns];
    return [...columns.slice(0, selectIndex + 1), rowNumberColumn, ...columns.slice(selectIndex + 1)];
  }, [columns]);

  const table = useReactTable({
    data: rows,
    columns: numberedColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) => String(rowKey(row, index)),
    columnResizeMode: "onChange",
    defaultColumn: { size: 150, minSize: 70, maxSize: 520 },
    state: columnVisibility ? { columnVisibility } : undefined,
  });

  const parentRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ pointerId: number; startX: number; startY: number; dragging: boolean } | null>(null);
  const suppressClickRef = React.useRef(false);
  const [marqueeBox, setMarqueeBox] = React.useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const tableRows = table.getRowModel().rows;

  React.useEffect(() => {
    if (!marqueeSelection) return;

    const onCandidateIdsChange = marqueeSelection.onCandidateIdsChange;

    function cancelCandidates(event: KeyboardEvent | PointerEvent) {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof PointerEvent) {
        const target = event.target;
        if (parentRef.current?.contains(target as Node)) return;
        if (target instanceof Element && target.closest('[role="menu"], [role="menuitem"]')) return;
      }
      dragRef.current = null;
      setMarqueeBox(null);
      onCandidateIdsChange(new Set());
    }

    document.addEventListener("keydown", cancelCandidates, true);
    document.addEventListener("pointerdown", cancelCandidates, true);
    return () => {
      document.removeEventListener("keydown", cancelCandidates, true);
      document.removeEventListener("pointerdown", cancelCandidates, true);
    };
  }, [marqueeSelection]);

  function handleMarqueePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!marqueeSelection || event.button !== 0 || event.pointerType !== "mouse") return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("tbody tr[data-row-id]")) return;
    if (target.closest('a, button, input, select, textarea, label, [role="button"], [role="menuitem"], [contenteditable="true"]')) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false };
    marqueeSelection.onCandidateIdsChange(new Set());
    setMarqueeBox(null);
  }

  function handleMarqueePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!marqueeSelection || !drag || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;

    drag.dragging = true;
    suppressClickRef.current = true;
    event.preventDefault();
    document.getSelection()?.removeAllRanges();

    const left = Math.min(drag.startX, event.clientX);
    const top = Math.min(drag.startY, event.clientY);
    const right = Math.max(drag.startX, event.clientX);
    const bottom = Math.max(drag.startY, event.clientY);
    setMarqueeBox({ left, top, width: right - left, height: bottom - top });

    const ids = new Set<string>();
    parentRef.current?.querySelectorAll<HTMLTableRowElement>("tbody tr[data-row-id]").forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rectanglesIntersect(rect, { left, right, top, bottom })) {
        const id = element.dataset.rowId;
        if (id) ids.add(id);
      }
    });
    marqueeSelection.onCandidateIdsChange(ids);
  }

  function finishMarquee(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.dragging) {
      event.preventDefault();
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragRef.current = null;
    setMarqueeBox(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems[virtualItems.length - 1]?.index;

  React.useEffect(() => {
    if (lastIndex == null) return;
    if (lastIndex >= tableRows.length - 8 && hasMore && !loading) onLoadMore();
  }, [lastIndex, tableRows.length, hasMore, loading, onLoadMore]);

  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom = virtualItems.length > 0 ? totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0) : 0;

  if (loading && rows.length === 0) {
    return <TableSkeleton columnCount={numberedColumns.length} rowHeight={rowHeight} />;
  }

  if (!loading && rows.length === 0) {
    return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <div
        ref={parentRef}
        className={cn("scrollbar-thin overflow-auto", marqueeSelection && "cursor-marquee")}
        style={{ height }}
        onPointerDown={handleMarqueePointerDown}
        onPointerMove={handleMarqueePointerMove}
        onPointerUp={finishMarquee}
        onPointerCancel={finishMarquee}
      >
        <table className="border-collapse text-xs" style={{ width: table.getTotalSize(), tableLayout: "fixed" }}>
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="relative select-none whitespace-nowrap border-b px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanResize() ? (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={cn(
                          "absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize touch-none select-none bg-transparent transition-colors hover:bg-primary/50",
                          header.column.getIsResizing() && "bg-primary"
                        )}
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 ? (
              <tr aria-hidden="true">
                <td style={{ height: paddingTop }} colSpan={numberedColumns.length} />
              </tr>
            ) : null}
            {virtualItems.map((virtualRow) => {
              const row = tableRows[virtualRow.index];
              if (!row) return null;
              return (
                <tr
                  key={row.id}
                  data-row-id={row.id}
                  className={cn(
                    "border-b transition-colors hover:bg-muted/40",
                    onRowClick && !marqueeSelection && "cursor-pointer",
                    marqueeSelection?.candidateIds.has(row.id) && "bg-primary/15 ring-1 ring-inset ring-primary/40"
                  )}
                  style={{ height: rowHeight }}
                  onClick={
                    onRowClick
                      ? () => {
                          if (suppressClickRef.current) return;
                          onRowClick(row.original);
                        }
                      : undefined
                  }
                  onContextMenu={
                    onRowContextMenu
                      ? (event) => {
                          event.preventDefault();
                          onRowContextMenu(row.original, event);
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 align-middle" style={{ width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 ? (
              <tr aria-hidden="true">
                <td style={{ height: paddingBottom }} colSpan={numberedColumns.length} />
              </tr>
            ) : null}
          </tbody>
        </table>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Memuat...
          </div>
        ) : null}
        {!hasMore && rows.length > 0 ? (
          <div className="py-2 text-center text-[11px] text-muted-foreground">
            {rows.length.toLocaleString("id-ID")} baris — akhir daftar
          </div>
        ) : null}
      </div>
      {marqueeBox
        ? createPortal(
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-[100] border border-primary bg-primary/15"
              style={marqueeBox}
            />,
            document.body
          )
        : null}
    </div>
  );
}

function TableSkeleton({ columnCount, rowHeight }: { columnCount: number; rowHeight: number }) {
  const rows = Array.from({ length: 8 });
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="space-y-0">
        {rows.map((_, index) => (
          <div key={index} className="flex items-center gap-3 border-b px-3 last:border-b-0" style={{ height: rowHeight }}>
            {Array.from({ length: Math.min(columnCount, 7) }).map((_, col) => (
              <Skeleton key={col} className="h-3.5 flex-1" style={{ animationDelay: `${(index + col) * 30}ms` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
