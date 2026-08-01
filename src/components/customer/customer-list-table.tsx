"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DataTable } from "@/components/data-table/data-table";
import { useInfiniteRows, type PagedResult } from "@/components/data-table/use-infinite-rows";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { loadCustomerListPage } from "@/app/customers-actions";
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

  const detailHref = React.useCallback(
    (id: number) => {
      const query = new URLSearchParams(searchParams.toString());
      query.set("customer", String(id));
      return `${pathname}?${query.toString()}`;
    },
    [pathname, searchParams]
  );

  const columns = React.useMemo(
    () => (variant === "customer" ? buildCustomerColumns(detailHref) : buildGroupMembershipColumns(detailHref)),
    [variant, detailHref]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <AnimatedNumber value={total} /> customer
          {rows.length > 0 && rows.length < total ? ` · ${rows.length.toLocaleString("id-ID")} dimuat` : ""}
        </p>
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
      />
    </div>
  );
}
