import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getApprovedComForPeriod } from "@/server/workspace/costs";
import { activeGenerationCondition, notDeletedCondition } from "@/server/workspace/generation";
import { workspaceManualOrderScope } from "@/server/workspace/provenance";
import { calculateAov, calculatePendapatanBersih } from "@/lib/workspace-pesanan-calculation";
import type { WorkspaceOrderStatus } from "@/lib/workspace-pesanan-contracts";

export type OverviewDateFilter = { from?: string; to?: string };
export type TrendGranularity = "daily" | "weekly" | "monthly";
export type KpiComparison = { percentage: number | null; previousValue: string };

/**
 * Dasar SEMUA read-model order Workspace Overview — provenance, angkatan, dan
 * soft delete sekaligus. Dipakai juga oleh panel yang TIDAK terbatas status
 * reportable (Status Pesanan, Pesanan Terbaru) supaya tidak ada satu pun query
 * Overview yang bisa lupa membuang baris berprovenance DATABASE_ALL.
 */
function overviewOrderBaseScope(alias = "o"): SQL {
  return sql`${workspaceManualOrderScope(alias)} AND ${activeGenerationCondition(alias)} AND ${notDeletedCondition(alias)}`;
}

const REPORTABLE_STATUSES = "('CONFIRMED','PARTIALLY_REFUNDED')";

/** Satu-satunya scope pesanan finansial Workspace Overview. */
export function overviewOrderScope(alias = "o"): SQL {
  const statusAndSource = sql.raw(
    `${alias}.status::text IN ${REPORTABLE_STATUSES} AND ${alias}.source_order_id IS NOT NULL`
  );
  return sql`${overviewOrderBaseScope(alias)} AND ${statusAndSource}`;
}

export async function refundDeductionForPeriod(from?: string, to?: string): Promise<bigint> {
  const start = from ?? "1900-01-01";
  const end = to ?? "2999-12-31";
  const result = await getDb().execute<{ refund: string }>(sql`
    SELECT COALESCE(SUM(o.refund_amount), 0)::text AS refund
    FROM workspace_orders o
    WHERE ${overviewOrderBaseScope("o")}
      AND o.status = 'PARTIALLY_REFUNDED' AND o.refund_amount IS NOT NULL
      AND o.source_order_id IS NOT NULL
      AND o.order_date BETWEEN ${start}::date AND ${end}::date
  `);
  return BigInt(result.rows[0]?.refund ?? "0");
}

export type OverviewKpi = {
  jumlahCustomer: number;
  jumlahPesanan: number;
  gross: string;
  /** Backward-compatible alias untuk pemanggil lama. */
  totalSales: string;
  cos: string;
  com: string;
  refund: string;
  aov: string;
  pendapatanBersih: string;
  comparison: {
    jumlahCustomer: KpiComparison;
    gross: KpiComparison;
    cos: KpiComparison;
    com: KpiComparison;
    aov: KpiComparison;
    pendapatanBersih: KpiComparison;
  };
  previousPeriod: { from: string; to: string } | null;
};

type FinancialPeriod = {
  jumlahCustomer: number;
  jumlahPesanan: number;
  gross: bigint;
  cos: bigint;
  com: bigint;
  refund: bigint;
  aov: bigint;
  net: bigint;
};

async function getFinancialPeriod(filter: OverviewDateFilter): Promise<FinancialPeriod> {
  const from = filter.from ?? "1900-01-01";
  const to = filter.to ?? "2999-12-31";
  const [result, com, refund] = await Promise.all([
    getDb().execute<{ jumlah_customer: string; jumlah_pesanan: string; gross: string; cos: string }>(sql`
      SELECT COUNT(DISTINCT o.normalized_phone)::text AS jumlah_customer,
        COUNT(DISTINCT o.id)::text AS jumlah_pesanan,
        COALESCE(SUM(i.total_sales_value), 0)::text AS gross,
        COALESCE(SUM(i.total_hpp), 0)::text AS cos
      FROM workspace_orders o
      LEFT JOIN workspace_order_items i ON i.order_id = o.id
      WHERE ${overviewOrderScope("o")} AND o.order_date BETWEEN ${from}::date AND ${to}::date
    `),
    getApprovedComForPeriod(filter.from, filter.to),
    refundDeductionForPeriod(filter.from, filter.to),
  ]);
  const row = result.rows[0];
  const jumlahPesanan = Number(row?.jumlah_pesanan ?? 0);
  const gross = BigInt(row?.gross ?? "0");
  const cos = BigInt(row?.cos ?? "0");
  const aov = calculateAov(gross, jumlahPesanan);
  return {
    jumlahCustomer: Number(row?.jumlah_customer ?? 0),
    jumlahPesanan,
    gross,
    cos,
    com,
    refund,
    aov,
    net: calculatePendapatanBersih(gross, cos, com) - refund,
  };
}

export function calculatePercentageChange(current: bigint, previous: bigint): number | null {
  if (previous === 0n) return null;
  return ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100;
}

export function previousPeriodFor(from?: string, to?: string): { from: string; to: string } | null {
  if (!from || !to) return null;
  const days = diffDays(from, to) + 1;
  const previousTo = addDays(from, -1);
  return { from: addDays(previousTo, -(days - 1)), to: previousTo };
}

function comparison(current: bigint, previous: bigint): KpiComparison {
  return { percentage: calculatePercentageChange(current, previous), previousValue: previous.toString() };
}

export async function getOverviewKpi(filter: OverviewDateFilter): Promise<OverviewKpi> {
  const previousPeriod = previousPeriodFor(filter.from, filter.to);
  const empty: FinancialPeriod = {
    jumlahCustomer: 0,
    jumlahPesanan: 0,
    gross: 0n,
    cos: 0n,
    com: 0n,
    refund: 0n,
    aov: 0n,
    net: 0n,
  };
  const [current, previous] = await Promise.all([
    getFinancialPeriod(filter),
    previousPeriod ? getFinancialPeriod(previousPeriod) : Promise.resolve(empty),
  ]);
  return {
    jumlahCustomer: current.jumlahCustomer,
    jumlahPesanan: current.jumlahPesanan,
    gross: current.gross.toString(),
    totalSales: current.gross.toString(),
    cos: current.cos.toString(),
    com: current.com.toString(),
    refund: current.refund.toString(),
    aov: current.aov.toString(),
    pendapatanBersih: current.net.toString(),
    comparison: {
      jumlahCustomer: comparison(BigInt(current.jumlahCustomer), BigInt(previous.jumlahCustomer)),
      gross: comparison(current.gross, previous.gross),
      cos: comparison(current.cos, previous.cos),
      com: comparison(current.com, previous.com),
      aov: comparison(current.aov, previous.aov),
      pendapatanBersih: comparison(current.net, previous.net),
    },
    previousPeriod,
  };
}

export type TrendPoint = { period: string; revenue: string; orderCount: number };
type RawTrendPoint = { period: string; revenue: string; order_count: string };

function bucketExpression(granularity: TrendGranularity): SQL {
  if (granularity === "daily") return sql`o.order_date`;
  if (granularity === "weekly") return sql`date_trunc('week', o.order_date)::date`;
  return sql`date_trunc('month', o.order_date)::date`;
}

export async function getRevenueOrderTrend(filter: OverviewDateFilter, granularity: TrendGranularity): Promise<TrendPoint[]> {
  const from = filter.from ?? "1900-01-01";
  const to = filter.to ?? "2999-12-31";
  const bucket = bucketExpression(granularity);
  const result = await getDb().execute<RawTrendPoint>(sql`
    SELECT ${bucket}::text AS period,
      COALESCE(SUM(i.total_sales_value), 0)::text AS revenue,
      COUNT(DISTINCT o.id)::text AS order_count
    FROM workspace_orders o
    LEFT JOIN workspace_order_items i ON i.order_id = o.id
    WHERE ${overviewOrderScope("o")} AND o.order_date BETWEEN ${from}::date AND ${to}::date
    GROUP BY ${bucket}
    ORDER BY ${bucket}
  `);
  const rows = result.rows.map((row) => ({ period: row.period, revenue: row.revenue, orderCount: Number(row.order_count) }));
  return filter.from && filter.to ? zeroFillTrendBuckets(rows, filter.from, filter.to, granularity) : rows;
}

/** Alias lama: pemilihan bucket otomatis, tetap memakai formula kanonik baru. */
export function getPesananTrend(filter: OverviewDateFilter): Promise<TrendPoint[]> {
  const granularity = filter.from && filter.to && diffDays(filter.from, filter.to) <= 45 ? "daily" : "monthly";
  return getRevenueOrderTrend(filter, granularity);
}

export function zeroFillTrendBuckets(
  rows: TrendPoint[],
  from: string,
  to: string,
  granularity: TrendGranularity
): TrendPoint[] {
  const byPeriod = new Map(rows.map((row) => [row.period, row]));
  const output: TrendPoint[] = [];
  let cursor = bucketStart(from, granularity);
  const end = bucketStart(to, granularity);
  while (cursor <= end) {
    output.push(byPeriod.get(cursor) ?? { period: cursor, revenue: "0", orderCount: 0 });
    cursor = nextBucket(cursor, granularity);
  }
  return output;
}

export type ProductDimensionRow = {
  productName: string;
  quantity: string;
  totalSales: string;
  cosSale: string;
  cosBonus: string;
  totalCos: string;
};

async function productDimension(
  filter: OverviewDateFilter,
  orderBy: "quantity" | "total_sales" | "total_cos",
  limit = 5
): Promise<ProductDimensionRow[]> {
  const from = filter.from ?? "1900-01-01";
  const to = filter.to ?? "2999-12-31";
  const result = await getDb().execute<{
    product_name: string;
    quantity: string;
    total_sales: string;
    cos_sale: string;
    cos_bonus: string;
    total_cos: string;
  }>(sql`
    SELECT i.product_name_snapshot AS product_name,
      COALESCE(SUM(i.quantity) FILTER (WHERE i.item_type = 'SALE'), 0)::text AS quantity,
      COALESCE(SUM(i.total_sales_value), 0)::text AS total_sales,
      COALESCE(SUM(i.total_hpp) FILTER (WHERE i.item_type = 'SALE'), 0)::text AS cos_sale,
      COALESCE(SUM(i.total_hpp) FILTER (WHERE i.item_type IN ('BONUS','SAMPLE')), 0)::text AS cos_bonus,
      COALESCE(SUM(i.total_hpp), 0)::text AS total_cos
    FROM workspace_order_items i
    JOIN workspace_orders o ON o.id = i.order_id
    WHERE ${overviewOrderScope("o")} AND o.order_date BETWEEN ${from}::date AND ${to}::date
    GROUP BY i.product_name_snapshot
    ORDER BY ${sql.raw(orderBy)} DESC, i.product_name_snapshot
    LIMIT ${limit}
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

export const getTopProductsByQuantity = (filter: OverviewDateFilter) => productDimension(filter, "quantity", 5);
export const getTopProductsByRevenue = (filter: OverviewDateFilter) => productDimension(filter, "total_sales", 5);
export const getTopProductsByCos = (filter: OverviewDateFilter) => productDimension(filter, "total_cos", 5);

export type PaymentComposition = { paymentMethod: "COD" | "TRANSFER"; closing: number; value: string };

export async function getPaymentComposition(filter: OverviewDateFilter): Promise<PaymentComposition[]> {
  const from = filter.from ?? "1900-01-01";
  const to = filter.to ?? "2999-12-31";
  const result = await getDb().execute<{ payment_method: "COD" | "TRANSFER"; closing: string; value: string }>(sql`
    SELECT o.payment_method::text AS payment_method,
      COUNT(DISTINCT o.id)::text AS closing,
      COALESCE(SUM(i.total_sales_value), 0)::text AS value
    FROM workspace_orders o
    LEFT JOIN workspace_order_items i ON i.order_id = o.id
    WHERE ${overviewOrderScope("o")} AND o.order_date BETWEEN ${from}::date AND ${to}::date
    GROUP BY o.payment_method
    ORDER BY o.payment_method
  `);
  return result.rows.map((row) => ({ paymentMethod: row.payment_method, closing: Number(row.closing), value: row.value }));
}

export type SalesSourceRow = { source: string; value: string };

export async function getSalesBySource(filter: OverviewDateFilter): Promise<SalesSourceRow[]> {
  const from = filter.from ?? "1900-01-01";
  const to = filter.to ?? "2999-12-31";
  const result = await getDb().execute<{ source: string; value: string }>(sql`
    SELECT COALESCE(NULLIF(BTRIM(o.sales_source), ''), 'Tanpa Sumber') AS source,
      COALESCE(SUM(i.total_sales_value), 0)::text AS value
    FROM workspace_orders o
    LEFT JOIN workspace_order_items i ON i.order_id = o.id
    WHERE ${overviewOrderScope("o")} AND o.order_date BETWEEN ${from}::date AND ${to}::date
    GROUP BY COALESCE(NULLIF(BTRIM(o.sales_source), ''), 'Tanpa Sumber')
    ORDER BY SUM(i.total_sales_value) DESC
  `);
  return result.rows;
}

export type StatusCompositionRow = { status: WorkspaceOrderStatus; count: number };

export async function getStatusComposition(filter: OverviewDateFilter): Promise<StatusCompositionRow[]> {
  const from = filter.from ?? "1900-01-01";
  const to = filter.to ?? "2999-12-31";
  const result = await getDb().execute<{ status: WorkspaceOrderStatus; count: string }>(sql`
    SELECT o.status::text AS status, COUNT(*)::text AS count
    FROM workspace_orders o
    WHERE ${overviewOrderBaseScope("o")}
      AND o.order_date BETWEEN ${from}::date AND ${to}::date
    GROUP BY o.status
    ORDER BY o.status
  `);
  return result.rows.map((row) => ({ status: row.status, count: Number(row.count) }));
}

export type ComCompositionRow = { category: string; value: string };

export async function getComComposition(filter: OverviewDateFilter): Promise<ComCompositionRow[]> {
  const from = filter.from ?? "1900-01-01";
  const to = filter.to ?? "2999-12-31";
  const result = await getDb().execute<{ category: string; value: string }>(sql`
    SELECT c.category::text AS category, SUM(c.amount)::text AS value
    FROM workspace_operational_costs c
    WHERE c.status = 'DIRECTOR_APPROVED'
      AND c.cost_date BETWEEN ${from}::date AND ${to}::date
    GROUP BY c.category
    HAVING SUM(c.amount) > 0
    ORDER BY SUM(c.amount) DESC
  `);
  return result.rows;
}

export type LatestOrderRow = {
  id: number;
  orderId: string;
  orderDate: string;
  customerName: string;
  crmName: string;
  products: string;
  total: string;
  paymentMethod: "COD" | "TRANSFER";
  status: WorkspaceOrderStatus;
};

export async function getLatestOrders(filter: OverviewDateFilter): Promise<LatestOrderRow[]> {
  const from = filter.from ?? "1900-01-01";
  const to = filter.to ?? "2999-12-31";
  const result = await getDb().execute<{
    id: number;
    order_id: string;
    order_date: string;
    customer_name: string;
    crm_name: string;
    products: string | null;
    total: string;
    payment_method: "COD" | "TRANSFER";
    status: WorkspaceOrderStatus;
  }>(sql`
    SELECT o.id::int AS id,
      COALESCE(o.source_order_id, o.order_number) AS order_id,
      o.order_date::text AS order_date,
      o.customer_name,
      o.crm_name_snapshot AS crm_name,
      string_agg(i.product_name_snapshot || ' (' || i.quantity::text || ')', ', ' ORDER BY i.line_no) AS products,
      o.order_total::text AS total,
      o.payment_method::text AS payment_method,
      o.status::text AS status
    FROM workspace_orders o
    LEFT JOIN workspace_order_items i ON i.order_id = o.id
    WHERE ${overviewOrderBaseScope("o")}
      AND o.order_date BETWEEN ${from}::date AND ${to}::date
    GROUP BY o.id
    ORDER BY o.order_date DESC, o.id DESC
    LIMIT 5
  `);
  return result.rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    orderDate: row.order_date,
    customerName: row.customer_name,
    crmName: row.crm_name,
    products: row.products ?? "—",
    total: row.total,
    paymentMethod: row.payment_method,
    status: row.status,
  }));
}

export type CustomerSummary = { jumlahCustomer: number; customerBaru: number; repeatCustomer: number; jumlahPesanan: number };

/** Kompatibilitas pemanggil lama; seluruh hitungan memakai scope reportable yang sama. */
export async function getCustomerSummary(filter: OverviewDateFilter): Promise<CustomerSummary> {
  const kpi = await getFinancialPeriod(filter);
  return { jumlahCustomer: kpi.jumlahCustomer, customerBaru: 0, repeatCustomer: 0, jumlahPesanan: kpi.jumlahPesanan };
}

export type WorkspaceOverviewReadModel = {
  kpi: OverviewKpi;
  trends: Record<TrendGranularity, TrendPoint[]>;
  topProducts: ProductDimensionRow[];
  salesBySource: SalesSourceRow[];
  paymentComposition: PaymentComposition[];
  statusComposition: StatusCompositionRow[];
  comComposition: ComCompositionRow[];
  latestOrders: LatestOrderRow[];
  reconciliation: {
    net: boolean;
    salesBySource: boolean;
    paymentComposition: boolean;
    comComposition: boolean;
  };
};

export class OverviewReconciliationError extends Error {
  constructor(metric: string) {
    super(`Rekonsiliasi Overview gagal: ${metric}`);
    this.name = "OverviewReconciliationError";
  }
}

export async function getWorkspaceOverview(filter: OverviewDateFilter): Promise<WorkspaceOverviewReadModel> {
  const [kpi, daily, weekly, monthly, topProducts, salesBySource, paymentComposition, statusComposition, comComposition, latestOrders] =
    await Promise.all([
      getOverviewKpi(filter),
      getRevenueOrderTrend(filter, "daily"),
      getRevenueOrderTrend(filter, "weekly"),
      getRevenueOrderTrend(filter, "monthly"),
      getTopProductsByRevenue(filter),
      getSalesBySource(filter),
      getPaymentComposition(filter),
      getStatusComposition(filter),
      getComComposition(filter),
      getLatestOrders(filter),
    ]);

  const gross = BigInt(kpi.gross);
  const com = BigInt(kpi.com);
  const reconciliation = {
    net: gross - BigInt(kpi.cos) - com - BigInt(kpi.refund) === BigInt(kpi.pendapatanBersih),
    salesBySource: sumValues(salesBySource) === gross,
    paymentComposition: sumValues(paymentComposition) === gross,
    comComposition: sumValues(comComposition) === com,
  };
  for (const [metric, valid] of Object.entries(reconciliation)) {
    if (!valid) throw new OverviewReconciliationError(metric);
  }

  return {
    kpi,
    trends: { daily, weekly, monthly },
    topProducts,
    salesBySource,
    paymentComposition,
    statusComposition,
    comComposition,
    latestOrders,
    reconciliation,
  };
}

function sumValues(rows: { value: string }[]): bigint {
  return rows.reduce((sum, row) => sum + BigInt(row.value), 0n);
}

function addDays(dateKey: string, delta: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function diffDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function bucketStart(dateKey: string, granularity: TrendGranularity): string {
  if (granularity === "daily") return dateKey;
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (granularity === "weekly") {
    const day = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  } else {
    date.setUTCDate(1);
  }
  return date.toISOString().slice(0, 10);
}

function nextBucket(dateKey: string, granularity: TrendGranularity): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (granularity === "daily") date.setUTCDate(date.getUTCDate() + 1);
  else if (granularity === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else date.setUTCMonth(date.getUTCMonth() + 1, 1);
  return date.toISOString().slice(0, 10);
}
