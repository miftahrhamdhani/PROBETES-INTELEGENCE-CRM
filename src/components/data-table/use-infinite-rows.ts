"use client";

import * as React from "react";

export interface PagedResult<TRow> {
  rows: TRow[];
  total: number;
  page: number;
  perPage: number;
  /** Keyset cursor untuk batch berikutnya. null = data habis. Sumber yang belum
   *  memakai cursor (mis. Workspace/CRM Report) cukup tidak mengirim field ini. */
  nextCursor?: string | null;
}

/**
 * Akumulasi baris untuk infinite scroll di atas server action ber-paginasi.
 * Filter/sort tetap 100% server-side; reset otomatis saat `filterKey` berubah.
 *
 * PAGINASI: kalau server mengirim `nextCursor`, batch berikutnya diminta dengan
 * cursor itu (keyset) sehingga halaman dalam tidak makin lambat dan tidak ada
 * baris yang terlewat/ganda saat data bergeser. Kalau tidak, jatuh kembali ke
 * page+1 seperti sebelumnya.
 *
 * TOTAL: server hanya menghitung COUNT pada batch pertama. Nilai dari batch
 * pertama itulah yang dipertahankan di sini — batch berikutnya tidak menimpanya.
 *
 * `initialData` (opsional): hasil batch 1 yang sudah di-fetch di server component
 * (SSR) — dipakai untuk seed setiap kali `filterKey` berubah DAN `initialData`
 * baru tersedia, bukan hanya sekali di mount. Pemanggil (mis. CustomerListTable)
 * SELALU menerima `filter` dari searchParams yang sudah diparse server dan
 * `initialData` yang cocok dari fetch server yang sama — jadi begitu navigasi
 * filter selesai, hasilnya SUDAH ada, bukan baru mulai dimuat. Tanpa reseed ini,
 * setiap perubahan filter/search akan (a) mengosongkan tabel sesaat lalu (b)
 * menjalankan fetch client KEDUA yang berlebihan untuk data yang server sudah
 * kirim — dua pelanggaran audit performa sekaligus (empty-state flash +
 * duplicate request).
 */
export function useInfiniteRows<TRow, TFilter>(
  fetchPage: (filter: TFilter, page: number) => Promise<PagedResult<TRow>>,
  filter: TFilter,
  filterKey: string,
  initialData?: PagedResult<TRow>
) {
  const seeded = !!initialData;

  const [rows, setRows] = React.useState<TRow[]>(seeded ? initialData.rows : []);
  const [total, setTotal] = React.useState(seeded ? initialData.total : 0);
  const [page, setPage] = React.useState(seeded ? initialData.page : 0);
  const [cursor, setCursor] = React.useState<string | null>(seeded ? initialData.nextCursor ?? null : null);
  const [exhausted, setExhausted] = React.useState(
    seeded ? initialData.nextCursor === null && initialData.rows.length >= initialData.total : false
  );
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
    const request = cursor ? { ...filter, cursor } : filter;

    fetchPage(request as TFilter, nextPage)
      .then((result) => {
        if (myRequestId !== requestId.current) return;
        setRows((prev) => (nextPage === 1 ? result.rows : [...prev, ...result.rows]));
        // Batch cursor mengembalikan total 0 (tidak dihitung ulang) — jangan menimpa.
        if (nextPage === 1) setTotal(result.total);
        setPage(nextPage);
        if (result.nextCursor !== undefined) {
          setCursor(result.nextCursor);
          if (result.nextCursor === null) setExhausted(true);
        }
        if (result.rows.length === 0) setExhausted(true);
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
  }, [filter, page, cursor]);

  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (seeded) return;
    }
    requestId.current++;
    // `initialData` (bukan cocok-tidaknya dengan key yang tercatat di MOUNT)
    // adalah penentu: setiap kali pemanggil mengirim initialData baru untuk
    // filterKey saat ini, itu berarti server SUDAH selesai fetch — reseed
    // langsung, jangan kosongkan tabel lalu fetch ulang dari client.
    if (initialData) {
      setRows(initialData.rows);
      setTotal(initialData.total);
      setPage(initialData.page);
      setCursor(initialData.nextCursor ?? null);
      setExhausted(initialData.nextCursor === null && initialData.rows.length >= initialData.total);
      setInitialized(true);
    } else {
      setRows([]);
      setTotal(0);
      setPage(0);
      setCursor(null);
      setExhausted(false);
      setInitialized(false);
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  React.useEffect(() => {
    if (!initialized && page === 0 && !loading) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, initialized]);

  /** Muat ulang dari batch 1 (mengganti seluruh rows, bukan menambah) — dipakai
   *  setelah create/edit/archive supaya tabel sinkron dengan server. */
  const reload = React.useCallback(() => {
    requestId.current++;
    setRows([]);
    setTotal(0);
    setPage(0);
    setCursor(null);
    setExhausted(false);
    setInitialized(false);
    setError(null);
  }, []);

  return {
    rows,
    total,
    loading,
    error,
    hasMore: !initialized || (!exhausted && rows.length < total),
    loadMore,
    reload,
  };
}
