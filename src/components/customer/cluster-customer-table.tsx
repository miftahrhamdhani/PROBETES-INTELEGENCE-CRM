"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DataTable } from "@/components/data-table/data-table";
import { useInfiniteRows, type PagedResult } from "@/components/data-table/use-infinite-rows";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { loadClusterCustomerListPage } from "@/app/customers-actions";
import { buildClusterCustomerColumns } from "./customer-columns";
import type { ClusterCustomerRow } from "@/lib/customer-types";
import type { CustomerListFilterInput } from "./customer-list-table";

/** Sama pola dengan CustomerListTable, khusus baris ClusterCustomerRow (Total
 *  Fisik, Produk yang Dibeli) yang dipakai tabel Customer Cluster. Kolom &
 *  detailHref dibangun di client (lihat catatan di CustomerListTable). */
export function ClusterCustomerTable({
  filter,
  initialData,
  height = 620,
}: {
  filter: CustomerListFilterInput;
  initialData?: PagedResult<ClusterCustomerRow>;
  height?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filterKey = React.useMemo(() => JSON.stringify(filter), [filter]);
  const { rows, total, loading, hasMore, loadMore, error } = useInfiniteRows(
    loadClusterCustomerListPage,
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

  const columns = React.useMemo(() => buildClusterCustomerColumns(detailHref), [detailHref]);

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
