/**
 * SHARED — tipe halaman Reconciliation.
 *
 * `universe` WAJIB ada di setiap angka. Ini bukan hiasan: kesalahan paling
 * sering di laporan seperti ini adalah membandingkan "baris file" dengan
 * "customer" seolah satuannya sama. Dengan label eksplisit, angka yang beda
 * satuan tidak pernah dijumlahkan atau disandingkan tanpa sadar.
 */
export type ReconciliationUniverse = "row" | "order" | "item" | "customer" | "transaction" | "membership";

export const UNIVERSE_LABELS: Record<ReconciliationUniverse, string> = {
  row: "baris file",
  order: "order",
  item: "item order",
  customer: "customer",
  transaction: "transaksi KSB",
  membership: "membership",
};

export type ReconciliationMetric = {
  key: string;
  label: string;
  value: number;
  universe: ReconciliationUniverse;
  /** Penjelasan singkat dari mana angka ini berasal. */
  note: string;
  /** Query drill-down bila tersedia (dibuka di halaman lain). */
  drilldownHref?: string;
};

export type ReconciliationSection = {
  id: string;
  title: string;
  description: string;
  metrics: ReconciliationMetric[];
  /** Persamaan yang harus balance, ditulis eksplisit supaya bisa dicek mata. */
  balance?: {
    expression: string;
    left: number;
    right: number;
    balanced: boolean;
  };
};

export type ReconciliationReport = {
  asOfDate: string | null;
  generatedFrom: string;
  sections: ReconciliationSection[];
};
