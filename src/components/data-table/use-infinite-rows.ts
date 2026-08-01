"use client";

import * as React from "react";

export interface PagedResult<TRow> {
  rows: TRow[];
  total: number;
  page: number;
  perPage: number;
}

/**
 * Akumulasi baris untuk infinite scroll di atas server action ber-paginasi
 * (page/perPage) yang sudah ada — bukan pagination baru, hanya dipanggil
 * berulang dengan page naik dan hasil digabung. Filter/sort tetap 100%
 * server-side (fetchPage memanggil server action asli); reset otomatis saat
 * `filterKey` berubah (JSON dari filter aktif).
 *
 * `initialData` (opsional): hasil page 1 yang sudah di-fetch di server component
 * (SSR) — dipakai untuk seed render pertama supaya tidak ada request client
 * tambahan & tidak ada layout shift saat halaman pertama kali dibuka.
 */
export function useInfiniteRows<TRow, TFilter>(
  fetchPage: (filter: TFilter, page: number) => Promise<PagedResult<TRow>>,
  filter: TFilter,
  filterKey: string,
  initialData?: PagedResult<TRow>
) {
  const initialFilterKeyRef = React.useRef(filterKey);
  const seeded = initialData && filterKey === initialFilterKeyRef.current;

  const [rows, setRows] = React.useState<TRow[]>(seeded ? initialData.rows : []);
  const [total, setTotal] = React.useState(seeded ? initialData.total : 0);
  const [page, setPage] = React.useState(seeded ? initialData.page : 0);
  const [loading, setLoading] = React.useState(false);
  const [initialized, setInitialized] = React.useState(!!seeded);
  const [error, setError] = React.useState<string | null>(null);
  const requestId = React.useRef(0);
  const firstRun = React.useRef(true);

  const loadMore = React.useCallback(() => {
    const myRequestId = ++requestId.current;
    setLoading(true);
    setError(null);
    const nextPage = page + 1;
    fetchPage(filter, nextPage)
      .then((result) => {
        if (myRequestId !== requestId.current) return;
        setRows((prev) => (nextPage === 1 ? result.rows : [...prev, ...result.rows]));
        setTotal(result.total);
        setPage(nextPage);
        setInitialized(true);
      })
      .catch((e) => {
        if (myRequestId !== requestId.current) return;
        setError(e instanceof Error ? e.message : "Gagal memuat data");
        setInitialized(true);
      })
      .finally(() => {
        if (myRequestId !== requestId.current) return;
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page]);

  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (seeded) return;
    }
    requestId.current++;
    const seedNow = initialData && filterKey === initialFilterKeyRef.current;
    if (seedNow) {
      setRows(initialData.rows);
      setTotal(initialData.total);
      setPage(initialData.page);
      setInitialized(true);
    } else {
      setRows([]);
      setTotal(0);
      setPage(0);
      setInitialized(false);
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  React.useEffect(() => {
    if (!initialized && page === 0 && !loading) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, initialized]);

  /** Muat ulang dari halaman 1 (mengganti seluruh rows, bukan menambah) — dipakai
   *  setelah create/edit/archive supaya tabel sinkron dengan server. */
  const reload = React.useCallback(() => {
    requestId.current++;
    setRows([]);
    setTotal(0);
    setPage(0);
    setInitialized(false);
    setError(null);
  }, []);

  return {
    rows,
    total,
    loading,
    error,
    hasMore: !initialized || rows.length < total,
    loadMore,
    reload,
  };
}
