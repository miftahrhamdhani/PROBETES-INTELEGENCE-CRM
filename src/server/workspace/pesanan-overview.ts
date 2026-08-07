import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getApprovedComForPeriod } from "@/server/workspace/costs";
import { activeGenerationCondition, notDeletedCondition } from "@/server/workspace/generation";
import { calculateAov, calculatePendapatanBersih } from "@/lib/workspace-pesanan-calculation";

export type OverviewDateFilter = { from?: string; to?: string };

/**
 * BUG-W03 — SATU-SATUNYA definisi "pesanan yang masuk laporan Overview".
 *
 * SEBELUM: setiap query menulis sendiri `o.status = 'CONFIRMED'`. Akibatnya
 * pesanan PARTIALLY_REFUNDED hilang 100% dari laporan padahal hanya sebagian
 * uangnya dikembalikan — Rp1.000.000 dengan refund Rp200.000 tercatat Rp0,
 * bukan Rp800.000.
 *
 * SESUDAH: PARTIALLY_REFUNDED ikut masuk populasi (barang tetap terkirim,
 * penjualan tetap terjadi), dan nilai refund-nya dikurangkan TERPISAH lewat
 * `refundDeductionForPeriod()`.
 *
 * RETURNED dan REFUNDED (penuh) TETAP di luar populasi — semantik existing
 * (markOrderReturned/markOrderRefunded di pesanan.ts) memperlakukan keduanya
 * sebagai pembatalan transaksi seutuhnya, jadi kontribusinya memang nol.
 * Aturan status itu TIDAK diubah oleh perbaikan ini.
 */
const REPORTABLE_STATUSES = "('CONFIRMED','PARTIALLY_REFUNDED')";

export function overviewOrderScope(alias = "o"): SQL {
  // Satu potongan raw utuh (bukan beberapa chunk terpisah) supaya SQL yang
  // dihasilkan terbaca menyatu — `alias` selalu konstanta internal, tidak
  // pernah berasal dari input pengguna. Pola sama dengan
  // activeGenerationCondition()/notDeletedCondition().
  const statusAndSource = sql.raw(
    `${alias}.status::text IN ${REPORTABLE_STATUSES} AND ${alias}.source_order_id IS NOT NULL`
  );
  return sql`${activeGenerationCondition(alias)} AND ${notDeletedCondition(alias)} AND ${statusAndSource}`;
}

/**
 * Total uang yang dikembalikan pada periode ini (hanya PARTIALLY_REFUNDED).
 *
 * SENGAJA hanya mengurangi PENDAPATAN, tidak menyentuh COS: `refund_amount`
 * adalah nominal UANG, dan tabel tidak menyimpan informasi item mana yang
 * dikembalikan. Mengurangi HPP secara proporsional berarti menebak barangnya
 * ikut kembali — tidak ada data yang mendukung itu, jadi tidak dilakukan
 * (lihat batasan yang dilaporkan di audit).
 */
export async function refundDeductionForPeriod(from?: string, to?: string): Promise<bigint> {
  const start = from ?? "1900-01-01";
  const end = to ?? "2999-12-31";
  const result = await getDb().execute<{ refund: string }>(sql`
    SELECT COALESCE(SUM(o.refund_amount), 0)::text AS refund
    FROM workspace_orders o
    WHERE ${activeGenerationCondition("o")} AND ${notDeletedCondition("o")}
      AND o.status = 'PARTIALLY_REFUNDED' AND o.refund_amount IS NOT NULL
      AND o.order_date BETWEEN ${start}::date AND ${end}::date
  `);
  return BigInt(result.rows[0]?.refund ?? "0");
}

export type TrendPoint = { period: string; totalSales: string; cos: string; com: string; refund: string; pendapatanBersih: string };

/** Trend harian (rentang <=45 hari) atau bulanan — Total Sales/COS/COM/Pendapatan Bersih (§7.2.1). */
export async function getPesananTrend(filter: OverviewDateFilter): Promise<TrendPoint[]> {
  const from = filter.from ?? "1900-01-01";
  const to = filter.to ?? "2999-12-31";
  const daily = filter.from && filter.to ? diffDays(filter.from, filter.to) <= 45 : false;
  const bucket = daily ? sql`o.order_date` : sql`date_trunc('month', o.order_date)::date`;
  const costBucket = daily ? sql`c.cost_date` : sql`date_trunc('month', c.cost_date)::date`;

  const [salesRows, comRows, refundRows] = await Promise.all([
    getDb().execute<{ period: string; total_sales: string; cos: string }>(sql`
      SELECT ${bucket}::text AS period, COALESCE(SUM(i.total_sales_value), 0)::text AS total_sales, COALESCE(SUM(i.total_hpp), 0)::text AS cos
      FROM workspace_orders o LEFT JOIN workspace_order_items i ON i.order_id = o.id
      WHERE ${overviewOrderScope("o")} AND o.order_date BETWEEN ${from}::date AND ${to}::date
      GROUP BY ${bucket} ORDER BY ${bucket}
    `),
    getDb().execute<{ period: string; com: string }>(sql`
      SELECT ${costBucket}::text AS period, COALESCE(SUM(c.amount), 0)::text AS com
      FROM workspace_operational_costs c
      WHERE c.status = 'DIRECTOR_APPROVED' AND c.cost_date BETWEEN ${from}::date AND ${to}::date
      GROUP BY ${costBucket} ORDER BY ${costBucket}
    `),
    // BUG-W03: tren memakai aturan refund YANG SAMA dengan kartu KPI, supaya
    // grafik dan kartu tidak pernah bercerita berbeda untuk periode yang sama.
    getDb().execute<{ period: string; refund: string }>(sql`
      SELECT ${bucket}::text AS period, COALESCE(SUM(o.refund_amount), 0)::text AS refund
      FROM workspace_orders o
      WHERE ${activeGenerationCondition("o")} AND ${notDeletedCondition("o")}
        AND o.status = 'PARTIALLY_REFUNDED' AND o.refund_amount IS NOT NULL
        AND o.order_date BETWEEN ${from}::date AND ${to}::date
      GROUP BY ${bucket} ORDER BY ${bucket}
    `),
  ]);

  const comByPeriod = new Map(comRows.rows.map((row) => [row.period, row.com]));
  const refundByPeriod = new Map(refundRows.rows.map((row) => [row.period, row.refund]));
  const periods = new Set([...salesRows.rows.map((r) => r.period), ...comRows.rows.map((r) => r.period)]);
  return [...periods].sort().map((period) => {
    const sales = salesRows.rows.find((r) => r.period === period);
    const totalSales = BigInt(sales?.total_sales ?? "0");
    const cos = BigInt(sales?.cos ?? "0");
    const com = BigInt(comByPeriod.get(period) ?? "0");
    const refund = BigInt(refundByPeriod.get(period) ?? "0");
    return {
      period,
      totalSales: totalSales.toString(),
      cos: cos.toString(),
      com: com.toString(),
      refund: refund.toString(),
      pendapatanBersih: (calculatePendapatanBersih(totalSales, cos, com) - refund).toString(),
    };
  });
}

export type ProductDimensionRow = { productName: string; quantity: string; totalSales: string; cosSale: string; cosBonus: string; totalCos: string };

async function productDimension(filter: OverviewDateFilter, orderBy: "quantity" | "total_sales" | "total_cos"): Promise<ProductDimensionRow[]> {
  const from = filter.from ?? "1900-01-01";
  const to = filter.to ?? "2999-12-31";
  const result = await getDb().execute<{ product_name: string; quantity: string; total_sales: string; cos_sale: string; cos_bonus: string; total_cos: string }>(sql`
    SELECT i.product_name_snapshot AS product_name,
      COALESCE(SUM(i.quantity) FILTER (WHERE i.item_type = 'SALE'), 0)::text AS quantity,
      COALESCE(SUM(i.total_sales_value) FILTER (WHERE i.item_type = 'SALE'), 0)::text AS total_sales,
      COALESCE(SUM(i.total_hpp) FILTER (WHERE i.item_type = 'SALE'), 0)::text AS cos_sale,
      COALESCE(SUM(i.total_hpp) FILTER (WHERE i.item_type <> 'SALE'), 0)::text AS cos_bonus,
      COALESCE(SUM(i.total_hpp), 0)::text AS total_cos
    FROM workspace_order_items i JOIN workspace_orders o ON o.id = i.order_id
    WHERE ${overviewOrderScope("o")} AND o.order_date BETWEEN ${from}::date AND ${to}::date
    GROUP BY i.product_name_snapshot
    ORDER BY ${sql.raw(orderBy)} DESC
    LIMIT 8
  `);
  return result.rows.map((row) => ({
    productName: row.product_name,
    quantity: row.quantity,
    totalSales: row.total_sales,
    cosSale: row.cos_sale,
    cosBonus: row.cos_bonus,
    totalCos: row.total_cos,
  }));
}

export const getTopProductsByQuantity = (filter: OverviewDateFilter) => productDimension(filter, "quantity");
export const getTopProductsByRevenue = (filter: OverviewDateFilter) => productDimension(filter, "total_sales");
export const getTopProductsByCos = (filter: OverviewDateFilter) => productDimension(filter, "total_cos");

export type PaymentComposition = { paymentMethod: "COD" | "TRANSFER"; closing: number; value: string };

export async function getPaymentComposition(filter: OverviewDateFilter): Promise<PaymentComposition[]> {
  const from = filter.from ?? "1900-01-01";
  const to = filter.to ?? "2999-12-31";
  const result = await getDb().execute<{ payment_method: "COD" | "TRANSFER"; closing: string; value: string }>(sql`
    SELECT o.payment_method::text AS payment_method, COUNT(*)::text AS closing, COALESCE(SUM(o.order_total), 0)::text AS value
    FROM workspace_orders o WHERE ${overviewOrderScope("o")} AND o.order_date BETWEEN ${from}::date AND ${to}::date
    GROUP BY o.payment_method
  `);
  return result.rows.map((row) => ({ paymentMethod: row.payment_method, closing: Number(row.closing), value: row.value }));
}

export type CustomerSummary = { jumlahCustomer: number; customerBaru: number; repeatCustomer: number; jumlahPesanan: number };

/** Customer Baru = transaksi pertama (sejak fresh start) jatuh dalam periode aktif.
 *  Repeat Customer = pernah transaksi sebelum periode aktif DAN transaksi lagi dalam periode (§7.2.6). */
export async function getCustomerSummary(filter: OverviewDateFilter): Promise<CustomerSummary> {
  const from = filter.from ?? "0001-01-01";
  const to = filter.to ?? "9999-12-31";
  const result = await getDb().execute<{ jumlah_customer: string; customer_baru: string; repeat_customer: string; jumlah_pesanan: string }>(sql`
    WITH customer_first AS (
      SELECT normalized_phone, MIN(order_date) AS first_date FROM workspace_orders WHERE ${activeGenerationCondition("")} AND ${notDeletedCondition("")} AND status = 'CONFIRMED' AND source_order_id IS NOT NULL GROUP BY normalized_phone
    ), in_period AS (
      SELECT DISTINCT normalized_phone FROM workspace_orders WHERE ${activeGenerationCondition("")} AND ${notDeletedCondition("")} AND status = 'CONFIRMED' AND source_order_id IS NOT NULL AND order_date BETWEEN ${from}::date AND ${to}::date
    )
    SELECT
      (SELECT COUNT(*) FROM in_period)::text AS jumlah_customer,
      COUNT(*) FILTER (WHERE cf.first_date BETWEEN ${from}::date AND ${to}::date)::text AS customer_baru,
      COUNT(*) FILTER (WHERE cf.first_date < ${from}::date)::text AS repeat_customer,
      (SELECT COUNT(*) FROM workspace_orders WHERE ${activeGenerationCondition("")} AND ${notDeletedCondition("")} AND status = 'CONFIRMED' AND source_order_id IS NOT NULL AND order_date BETWEEN ${from}::date AND ${to}::date)::text AS jumlah_pesanan
    FROM in_period ip JOIN customer_first cf ON cf.normalized_phone = ip.normalized_phone
  `);
  const row = result.rows[0];
  return {
    jumlahCustomer: Number(row?.jumlah_customer ?? 0),
    customerBaru: Number(row?.customer_baru ?? 0),
    repeatCustomer: Number(row?.repeat_customer ?? 0),
    jumlahPesanan: Number(row?.jumlah_pesanan ?? 0),
  };
}

export type OverviewKpi = {
  jumlahCustomer: number;
  jumlahPesanan: number;
  totalSales: string;
  /** AOV = Total Sales ÷ Jumlah Pesanan CONFIRMED periode ini — lihat
   *  calculateAov() di lib/workspace-pesanan-calculation.ts untuk rumus persis. */
  aov: string;
  cos: string;
  com: string;
  /** BUG-W03 — total uang dikembalikan (PARTIALLY_REFUNDED) pada periode ini.
   *  Dipisah sebagai angka tersendiri supaya pengurangannya terlihat, bukan
   *  potongan tersembunyi di dalam Pendapatan Bersih. */
  refund: string;
  /** Total Sales − COS − COM − Refund. */
  pendapatanBersih: string;
};

/** 6 KPI Overview (§7.1 + AOV) — selalu murni tanggal, tidak ada dimensi lain. */
export async function getOverviewKpi(filter: OverviewDateFilter): Promise<OverviewKpi> {
  const from = filter.from ?? "1900-01-01";
  const to = filter.to ?? "2999-12-31";
  // COM tidak bergantung pada hasil query KPI — dijalankan paralel supaya
  // Overview tidak membayar dua round trip Neon berurutan untuk satu kartu.
  const [result, com, refund] = await Promise.all([
    getDb().execute<{ jumlah_customer: string; jumlah_pesanan: string; total_sales: string; cos: string }>(sql`
    SELECT COUNT(DISTINCT o.normalized_phone)::text AS jumlah_customer,
      COUNT(DISTINCT o.id)::text AS jumlah_pesanan,
      COALESCE(SUM(i.total_sales_value), 0)::text AS total_sales, COALESCE(SUM(i.total_hpp), 0)::text AS cos
    FROM workspace_orders o LEFT JOIN workspace_order_items i ON i.order_id = o.id
    WHERE ${overviewOrderScope("o")} AND o.order_date BETWEEN ${from}::date AND ${to}::date
  `),
    getApprovedComForPeriod(filter.from, filter.to),
    refundDeductionForPeriod(filter.from, filter.to),
  ]);
  const row = result.rows[0];
  const cos = BigInt(row?.cos ?? "0");
  const totalSales = BigInt(row?.total_sales ?? "0");
  const jumlahPesanan = Number(row?.jumlah_pesanan ?? 0);
  return {
    jumlahCustomer: Number(row?.jumlah_customer ?? 0),
    jumlahPesanan,
    totalSales: totalSales.toString(),
    aov: calculateAov(totalSales, jumlahPesanan).toString(),
    cos: cos.toString(),
    com: com.toString(),
    refund: refund.toString(),
    // Refund uang ikut mengurangi pendapatan; COS TIDAK dikurangi karena tidak
    // ada data barang kembali (lihat refundDeductionForPeriod).
    pendapatanBersih: (calculatePendapatanBersih(totalSales, cos, com) - refund).toString(),
  };
}

function diffDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}
