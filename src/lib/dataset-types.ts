export type ActiveDatasetInfo = {
  asOfDate: string | null;
  databaseAllActive: boolean;
  ksbActive: boolean;
  groupListActive: boolean;
};

/** Ringkasan satu sumber data aktif — dipakai kartu "Active sources" Dashboard.
 *  Semua angka berasal dari import_batches/tabel canonical, tidak ada placeholder. */
export type ActiveSourceSummary = {
  sourceType: "DATABASE_ALL" | "KSB" | "GROUP_LIST";
  label: string;
  active: boolean;
  filename: string | null;
  /** Baris sumber pada batch aktif (import_batches.total_rows). */
  sourceRows: number | null;
  /** Baris canonical yang benar-benar terbentuk dari sumber ini. */
  canonicalRows: number | null;
  canonicalLabel: string;
  /** as_of_date batch (hanya Database All yang punya). */
  asOfDate: string | null;
  uploadedAt: string | null;
};

/**
 * Konteks dataset yang dipakai BERSAMA oleh seluruh query analytics dalam satu
 * request: satu kali ambil, lalu dioper sebagai parameter. Menghindari
 * MAX(order_date) dan EXISTS(batch aktif) diulang di tiap query.
 *
 * `asOfDate` di sini = MAX(order_date) tabel `orders` (Probetes saja) — definisi
 * yang sama dengan docs/02-CLUSTER-RULES.md §3.3, bukan NOW() dan bukan tanggal
 * maksimum transaksi KSB.
 */
export type DatasetContext = {
  hasActiveDatabaseAll: boolean;
  asOfDate: string | null;
};
