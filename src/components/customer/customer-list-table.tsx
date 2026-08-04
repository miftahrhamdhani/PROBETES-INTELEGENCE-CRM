"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DataTable } from "@/components/data-table/data-table";
import { useInfiniteRows, type PagedResult } from "@/components/data-table/use-infinite-rows";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { loadCustomerListPage } from "@/app/customers-actions";
import { AddToPembagianTugasDialog, type PendingBroadcastCustomer } from "./add-to-pembagian-tugas-dialog";
import { CustomerBulkToolbar } from "./customer-bulk-toolbar";
import { CustomerRowMenu, type MenuTarget } from "./customer-row-menu";
import { buildCustomerColumns, buildGroupMembershipColumns } from "./customer-columns";
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
 * Klik kanan/⋮ + multi-select HANYA untuk variant="customer" (Group Membership
 * punya alur sendiri lewat kolom Status Grup, tidak perlu duplikasi menu ini).
 */
export function CustomerListTable({
  variant,
  filter,
  initialData,
  height = 620,
}: {
  variant: "customer" | "group";
  filter: CustomerListFilterInput;
  initialData?: PagedResult<CustomerListRow>;
  height?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filterKey = React.useMemo(() => JSON.stringify(filter), [filter]);
  const { rows, total, loading, hasMore, loadMore, error } = useInfiniteRows(
    loadCustomerListPage,
    filter,
    filterKey,
    initialData
  );

  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [candidates, setCandidates] = React.useState<Set<string>>(new Set());
  const [menuTarget, setMenuTarget] = React.useState<MenuTarget | null>(null);
  const [pendingBroadcast, setPendingBroadcast] = React.useState<PendingBroadcastCustomer[] | null>(null);

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
          <AnimatedNumber value={total} /> customer
          {rows.length > 0 && rows.length < total ? ` · ${rows.length.toLocaleString("id-ID")} dimuat` : ""}
        </p>
        {variant === "customer" ? (
          <CustomerBulkToolbar
            selectedCount={selected.size}
            onClear={() => setSelected(new Set())}
            onAddToTasks={() =>
              setPendingBroadcast(
                rows
                  .filter((r) => selected.has(r.customerId))
                  .map((r) => ({ id: r.customerId, name: r.displayName, phone: r.normalizedPhone }))
              )
            }
          />
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
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
        </>
      ) : null}
    </div>
  );
}
