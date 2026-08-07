"use client";

import * as React from "react";
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const TASK_PAGE_SIZES = [10, 25, 50, 60, 100] as const;

/**
 * Deret nomor halaman ala `1 2 3 4 5 … 12` — selalu menampilkan halaman
 * pertama & terakhir plus tetangga halaman aktif, sisanya diringkas "…".
 */
export function buildPageItems(current: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set<number>([1, totalPages, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= totalPages - 2) [totalPages - 1, totalPages - 2, totalPages - 3].forEach((p) => pages.add(p));

  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const items: (number | "ellipsis")[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) items.push("ellipsis");
    items.push(page);
    previous = page;
  }
  return items;
}

/**
 * Tabel Pembagian Tugas — TanStack Table (sudah terpasang) dengan paginasi
 * klasik sesuai desain referensi.
 *
 * PENTING soal paginasi: sumber datanya TETAP infinite-chunk server-side yang
 * sudah ada (`useInfiniteRows` + `loadWorkspaceTaskListPage`, 60 baris/batch).
 * Paginasi di sini membagi baris yang SUDAH dimuat itu menjadi halaman —
 * dan begitu user membuka halaman yang melewati batas baris termuat, batch
 * berikutnya diminta lewat `onLoadMore()`. Jadi tidak ada perubahan kontrak
 * server dan TIDAK pernah menarik seluruh task sekaligus.
 */
export function TaskTable<TRow extends { id: number }>({
  columns,
  rows,
  total,
  loading,
  hasMore,
  onLoadMore,
  onRowClick,
  onRowContextMenu,
  selectedIds,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  emptyState,
}: {
  columns: ColumnDef<TRow, unknown>[];
  rows: TRow[];
  /** Total hasil filter di server (bukan jumlah baris yang sudah dimuat). */
  total: number;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onRowClick?: (row: TRow) => void;
  onRowContextMenu?: (row: TRow, event: React.MouseEvent<HTMLTableRowElement>) => void;
  selectedIds: ReadonlySet<number>;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  emptyState?: React.ReactNode;
}) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
    defaultColumn: { size: 150 },
  });

  const loadedCount = rows.length;
  // Halaman dihitung dari baris yang sudah dimuat; kalau server masih punya
  // sisa, tambahkan satu halaman "berikutnya" supaya user bisa memicu load.
  const pagesFromLoaded = Math.max(Math.ceil(loadedCount / pageSize), 1);
  const totalPages = hasMore ? pagesFromLoaded + 1 : pagesFromLoaded;
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = table.getRowModel().rows.slice(start, start + pageSize);

  // Halaman aktif melewati baris termuat -> minta batch berikutnya.
  React.useEffect(() => {
    if (!loading && hasMore && start + pageSize > loadedCount) onLoadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, loadedCount, hasMore, loading]);

  const from = loadedCount === 0 ? 0 : start + 1;
  const to = Math.min(start + pageSize, loadedCount);
  const pageItems = buildPageItems(currentPage, totalPages);

  if (!loading && loadedCount === 0) {
    return <div className="border-t px-4 py-16">{emptyState}</div>;
  }

  return (
    <div>
      <div className="scrollbar-thin overflow-x-auto border-t">
        {/* `table-layout: fixed` + minWidth: lebar kolom dari definisi kolom
            benar-benar dipatuhi (supaya `truncate` bekerja), melar mengisi
            ruang saat layar lebar, dan menggeser horizontal saat sempit. */}
        <table
          className="w-full border-collapse text-xs"
          style={{ tableLayout: "fixed", minWidth: table.getTotalSize() }}
        >
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/60">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    // `truncate`, BUKAN `whitespace-nowrap`: dengan table-layout
                    // fixed, judul yang lebih panjang dari kolomnya akan meluber
                    // menimpa judul sebelahnya. Judul lengkapnya tetap terbaca
                    // lewat `title` (tooltip bawaan browser).
                    className="truncate border-b px-2.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                    title={typeof header.column.columnDef.header === "string" ? header.column.columnDef.header : undefined}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const selected = selectedIds.has(row.original.id);
              return (
                <tr
                  key={row.id}
                  data-row-id={row.id}
                  className={cn(
                    "group/row border-b transition-colors last:border-b-0",
                    selected ? "bg-blue-50/80 dark:bg-blue-950/30" : "hover:bg-blue-50/50 dark:hover:bg-slate-800/40",
                    onRowClick && "cursor-pointer"
                  )}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
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
                    <td key={cell.id} className="overflow-hidden px-2.5 py-2.5 align-middle" style={{ width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {loading && pageRows.length === 0
              ? Array.from({ length: Math.min(pageSize, 10) }, (_, i) => (
                  <tr key={`skeleton-${i}`} className="border-b last:border-b-0">
                    {columns.map((_, col) => (
                      <td key={col} className="px-3 py-2.5">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rows per page:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              onPageSizeChange(Number(value));
              onPageChange(1);
            }}
          >
            <SelectTrigger className="h-8 w-[72px]" aria-label="Baris per halaman">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="tabular text-muted-foreground">
            {from.toLocaleString("id-ID")}–{to.toLocaleString("id-ID")} dari {loadedCount.toLocaleString("id-ID")} dimuat
            {total > loadedCount ? ` (${total.toLocaleString("id-ID")} total)` : ""}
          </span>
          <nav className="flex items-center gap-1" aria-label="Navigasi halaman">
            <PageButton
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </PageButton>
            {pageItems.map((item, index) =>
              item === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="px-1 text-muted-foreground">
                  …
                </span>
              ) : (
                <PageButton
                  key={item}
                  onClick={() => onPageChange(item)}
                  active={item === currentPage}
                  aria-label={`Halaman ${item}`}
                  aria-current={item === currentPage ? "page" : undefined}
                >
                  {item}
                </PageButton>
              )
            )}
            <PageButton
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              aria-label="Halaman berikutnya"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </PageButton>
          </nav>
        </div>
      </div>
    </div>
  );
}

function PageButton({
  children,
  onClick,
  disabled,
  active,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs transition-colors",
        active
          ? "border-blue-300 bg-blue-50 font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
          : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        disabled && "pointer-events-none opacity-40"
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
