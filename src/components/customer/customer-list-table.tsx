"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal, RotateCw } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { useInfiniteRows, type PagedResult } from "@/components/data-table/use-infinite-rows";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { loadCustomerListPage } from "@/app/customers-actions";
import { AddToPembagianTugasDialog, type PendingBroadcastCustomer } from "./add-to-pembagian-tugas-dialog";
import { applyBulkArchive, applyBulkMembershipPatch } from "./bulk-membership-actions";
import { BulkConfirmDialog } from "./bulk-confirm-dialog";
import { BulkGroupDialog, type BulkTarget } from "./bulk-group-dialog";
import { BulkPicDialog } from "./bulk-pic-dialog";
import { BroadcastExportButton } from "./broadcast-export-button";
import { CustomerBulkToolbar } from "./customer-bulk-toolbar";
import { CustomerRowMenu, type MenuTarget } from "./customer-row-menu";
import { ColumnVisibilityDropdown, OPTIONAL_CUSTOMER_COLUMNS } from "./column-visibility-dropdown";
import { useColumnVisibility } from "./column-visibility";
import { downloadSelectedCustomersCsv } from "./client-export";
import { buildCustomerColumns, buildGroupMembershipColumns } from "./customer-columns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CustomerListFilter, CustomerListRow } from "@/lib/customer-types";

export type CustomerListFilterInput = Omit<CustomerListFilter, "page" | "perPage">;

/**
 * Tabel Customer/Group Membership dengan infinite scroll + virtualisasi (DataTable)
 * di atas server action `loadCustomerListPage` — filter datang dari URL (dibaca di
 * server component pemanggil), fetch berikutnya tetap 100% server-side.
 *
 * `columns`/`detailHref` SENGAJA dibangun di sini (client), bukan diterima sebagai
 * prop dari Server Component — React Server Components tidak mengizinkan fungsi
 * (closure) lewat sebagai props dari server ke client, hanya data biasa (lihat
 * error "Attempted to call ... from the server but ... is on the client").
 *
 * Toolbar (Refresh/Tampilan Kolom/Export/More) + bulk action lengkap HANYA untuk
 * variant="customer" — Group Membership punya alur sendiri lewat kolom Status
 * Grup, tidak perlu duplikasi menu ini (perilaku halaman /groups sengaja tidak
 * disentuh oleh redesign ini).
 */
export function CustomerListTable({
  variant,
  filter,
  initialData,
  height = 620,
  picOptions = [],
}: {
  variant: "customer" | "group";
  filter: CustomerListFilterInput;
  initialData?: PagedResult<CustomerListRow>;
  height?: number;
  picOptions?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filterKey = React.useMemo(() => JSON.stringify(filter), [filter]);
  const { rows, total, loading, hasMore, loadMore, reload, error } = useInfiniteRows(
    loadCustomerListPage,
    filter,
    filterKey,
    initialData
  );

  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [candidates, setCandidates] = React.useState<Set<string>>(new Set());
  const [menuTarget, setMenuTarget] = React.useState<MenuTarget | null>(null);
  const [pendingBroadcast, setPendingBroadcast] = React.useState<PendingBroadcastCustomer[] | null>(null);
  const [pendingGroup, setPendingGroup] = React.useState<BulkTarget[] | null>(null);
  const [pendingPic, setPendingPic] = React.useState<BulkTarget[] | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = React.useState<BulkTarget[] | null>(null);
  const [pendingRemoveGroup, setPendingRemoveGroup] = React.useState<BulkTarget[] | null>(null);

  const { hidden: hiddenColumns, visibility: columnVisibility, toggleColumn } = useColumnVisibility(
    "customers",
    OPTIONAL_CUSTOMER_COLUMNS.map((c) => c.id)
  );

  React.useEffect(() => {
    setSelected(new Set());
    setCandidates(new Set());
  }, [filterKey]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.customerId));
  const someSelected = selected.size > 0;
  // useCallback + functional setState (bukan membaca `allSelected` dari closure
  // render) — infinite scroll menambah `rows` tanpa mengubah `selected`, jadi
  // tanpa ini `columns` yang di-memo bisa menyimpan toggleAll basi yang cuma
  // tahu baris lama saat "centang semua" diklik setelah scroll memuat lebih banyak.
  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const isAllSelected = rows.length > 0 && rows.every((r) => prev.has(r.customerId));
      return isAllSelected ? new Set() : new Set(rows.map((r) => r.customerId));
    });
  }, [rows]);

  const detailHref = React.useCallback(
    (id: number) => {
      const query = new URLSearchParams(searchParams.toString());
      query.set("customer", String(id));
      return `${pathname}?${query.toString()}`;
    },
    [pathname, searchParams]
  );

  const openMenu = React.useCallback((row: CustomerListRow, x: number, y: number) => {
    setMenuTarget({ customerId: row.customerId, name: row.displayName, phone: row.normalizedPhone, x, y });
  }, []);

  function commitCandidates() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of candidates) next.add(Number(id));
      return next;
    });
    setCandidates(new Set());
    setMenuTarget(null);
  }

  const selectedRows = React.useMemo(() => rows.filter((r) => selected.has(r.customerId)), [rows, selected]);
  const selectedTargets = React.useCallback(
    (): BulkTarget[] => selectedRows.map((r) => ({ id: r.customerId, name: r.displayName })),
    [selectedRows]
  );

  function resetFilters() {
    router.push(pathname, { scroll: false });
  }

  const columns = React.useMemo(
    () =>
      variant === "customer"
        ? buildCustomerColumns({
            detailHref,
            selectedIds: selected,
            onToggle: toggle,
            allSelected,
            someSelected,
            onToggleAll: toggleAll,
            onOpenMenu: openMenu,
          })
        : buildGroupMembershipColumns(detailHref),
    [variant, detailHref, selected, allSelected, someSelected, toggleAll, openMenu]
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <AnimatedNumber value={total} /> customer{variant === "customer" ? " ditemukan" : ""}
          {rows.length > 0 && rows.length < total ? ` · ${rows.length.toLocaleString("id-ID")} dimuat` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {variant === "customer" ? (
            <>
              <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
                <RotateCw className="h-3.5 w-3.5" /> Refresh
              </Button>
              <ColumnVisibilityDropdown hidden={hiddenColumns} onToggle={toggleColumn} />
              <BroadcastExportButton filter={filter} expectedRows={total} label="Export" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={resetFilters}>Reset semua filter</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
        </div>
      </div>
      {variant === "customer" ? (
        <CustomerBulkToolbar
          selectedCount={selected.size}
          onClear={() => setSelected(new Set())}
          onAddToTasks={() =>
            setPendingBroadcast(
              selectedRows.map((r) => ({ id: r.customerId, name: r.displayName, phone: r.normalizedPhone }))
            )
          }
          onAddToGroup={() => setPendingGroup(selectedTargets())}
          onChangePic={() => setPendingPic(selectedTargets())}
          onRemoveFromGroup={() => setPendingRemoveGroup(selectedTargets())}
          onDeactivate={() => setPendingDeactivate(selectedTargets())}
          onExportSelected={() => downloadSelectedCustomersCsv(selectedRows)}
        />
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.customerId}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        height={height}
        onRowClick={(row) => router.push(detailHref(row.customerId))}
        onRowContextMenu={
          variant === "customer"
            ? (row, event) => openMenu(row, event.clientX, event.clientY)
            : undefined
        }
        marqueeSelection={
          variant === "customer"
            ? { candidateIds: candidates, onCandidateIdsChange: setCandidates }
            : undefined
        }
        columnVisibility={variant === "customer" ? columnVisibility : undefined}
      />

      {variant === "customer" ? (
        <>
          <CustomerRowMenu
            target={menuTarget}
            onClose={() => setMenuTarget(null)}
            onView={(id) => {
              setMenuTarget(null);
              router.push(detailHref(id));
            }}
            onAddToTasks={(customers) => {
              setMenuTarget(null);
              setPendingBroadcast(customers);
            }}
            candidateCount={candidates.size}
            onCommitCandidates={commitCandidates}
          />
          <AddToPembagianTugasDialog
            customers={pendingBroadcast}
            onOpenChange={(open) => !open && setPendingBroadcast(null)}
            onDone={() => setSelected(new Set())}
          />
          <BulkGroupDialog
            customers={pendingGroup}
            picOptions={picOptions}
            onOpenChange={(open) => !open && setPendingGroup(null)}
            onDone={() => {
              setSelected(new Set());
              reload();
            }}
          />
          <BulkPicDialog
            customers={pendingPic}
            picOptions={picOptions}
            onOpenChange={(open) => !open && setPendingPic(null)}
            onDone={() => {
              setSelected(new Set());
              reload();
            }}
          />
          <BulkConfirmDialog
            customers={pendingDeactivate}
            title="Nonaktifkan customer terpilih?"
            description="customer disembunyikan dari daftar Customers/Group Membership. RFM, Cohort, Frequency, dan Cluster tidak berubah."
            actionLabel="Nonaktifkan"
            onOpenChange={(open) => !open && setPendingDeactivate(null)}
            onConfirm={async (targets) => {
              await applyBulkArchive(targets.map((t) => t.id), true);
              setPendingDeactivate(null);
              setSelected(new Set());
              reload();
            }}
          />
          <BulkConfirmDialog
            customers={pendingRemoveGroup}
            title="Hapus dari grup?"
            description="status grup diubah menjadi Belum Masuk Grup dan nama grup dikosongkan."
            actionLabel="Hapus dari Grup"
            onOpenChange={(open) => !open && setPendingRemoveGroup(null)}
            onConfirm={async (targets) => {
              await applyBulkMembershipPatch(
                targets.map((t) => t.id),
                { status: "NOT_GROUPED", groupName: null }
              );
              setPendingRemoveGroup(null);
              setSelected(new Set());
              reload();
            }}
          />
        </>
      ) : null}
    </div>
  );
}
