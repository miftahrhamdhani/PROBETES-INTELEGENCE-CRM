import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { buildFrequencyRows, buildRetentionRows } from "./transform";
import type {
  DashboardSummary,
  FrequencyAnalytics,
  FrequencyDistributionItem,
  MonthlyTrendItem,
  RetentionAnalytics,
  RfmAnalytics,
} from "@/lib/analytics-types";
import { MONETARY_BUCKETS, RECENCY_BUCKETS, RFM_FREQUENCY_BUCKETS } from "@/lib/analytics-types";

const LEGACY_MAX_MONTH = 24;

/**
 * Cakupan dataset analytics — SATU definisi untuk semua query di file ini.
 *
 * Keputusan Q17 ([docs/07-OPEN-QUESTIONS.md]): analytics membaca SELURUH order
 * kanonik, bukan hanya order milik batch aktif. Alasannya, Database All adalah
 * full snapshot yang tidak pernah menghapus baris lama (04-DESIGN.md §2.3): saat
 * order di-upsert, source_batch_id ikut pindah ke batch baru, jadi memfilter
 * is_active akan membuang order yang kebetulan tidak ikut di file terakhir.
 *
 * `is_active` tetap dipakai sebagai gerbang "sudah ada dataset atau belum" lewat
 * EXISTS — tanpa batch aktif, seluruh analytics kosong (empty state). Ini juga
 * yang dipakai rebuildRfm/rebuildClusters, sehingga RFM/Cluster dan
 * Cohort/Retention/Frequency selalu memakai basis yang sama.
 */
const HAS_ACTIVE_DATASET = sql`
  EXISTS (
    SELECT 1 FROM import_batches b
    WHERE b.source_type = 'DATABASE_ALL' AND b.is_active = true
  )
`;

/**
 * customer_rfm_current sekarang juga berisi customer KSB-murni (frequency=0,
 * monetary=0 — lihat rebuildRfm di orchestrator.ts) supaya Cluster B bisa
 * dihitung dari SELURUH histori KSB. RFM/Dashboard overview di sini adalah
 * tentang perilaku beli Probetes, jadi harus tetap dipagari `frequency > 0`
 * seperti sebelum ada baris KSB-murni — hasil dashboard TIDAK berubah karena ini,
 * hanya menjaga supaya tidak ikut ternoda baris baru tsb.
 */
const HAS_PROBETES_ORDER = sql`r.frequency > 0`;

const CANONICAL_ORDERS = sql`
  SELECT o.customer_id, o.order_date, o.order_total
  FROM orders o
  WHERE ${HAS_ACTIVE_DATASET}
`;

type RetentionDbRow = {
  cohort: string;
  total_sales: string;
  new_customers: string;
  returning_customers: string;
  retained_revenue: string;
  average_retention: string;
  retention_ratio: string;
  month_index: number | null;
  month_users: string | null;
  month_revenue: string | null;
  month_ratio: string | null;
  partial: boolean | null;
};

type FrequencyDbRow = {
  cohort: string;
  cohort_size: string;
  order_number: number | null;
  users: string | null;
  revenue: string | null;
  ratio: string | null;
};

type DistributionDbRow = {
  bucket: FrequencyDistributionItem["bucket"];
  customers: string;
};

export async function getRetentionAnalytics(): Promise<RetentionAnalytics> {
  const db = getDb();
  const [asOfResult, result] = await Promise.all([
    db.execute<{ as_of_date: string | null }>(sql`
      SELECT MAX(o.order_date)::text AS as_of_date
      FROM orders o
      WHERE ${HAS_ACTIVE_DATASET}
    `),
    db.execute<RetentionDbRow>(sql`
      WITH active_orders AS (
        ${CANONICAL_ORDERS}
      ),
      dataset AS (
        SELECT MAX(order_date) AS as_of_date FROM active_orders
      ),
      -- Satu pass per customer. Kolom last_month menggantikan correlated EXISTS
      -- "punya order di bulan setelah cohort": ekuivalen dengan bulan order
      -- terakhir > cohort_month, tapi tanpa subquery per baris. Versi EXISTS
      -- menjalankan 20.322 loop (~18s); ini ~0,1s dengan hasil identik.
      customer_span AS (
        SELECT
          customer_id,
          date_trunc('month', MIN(order_date))::date AS cohort_month,
          date_trunc('month', MAX(order_date))::date AS last_month
        FROM active_orders
        GROUP BY customer_id
      ),
      monthly_activity AS (
        SELECT
          c.cohort_month,
          (
            (EXTRACT(YEAR FROM o.order_date) - EXTRACT(YEAR FROM c.cohort_month)) * 12 +
            (EXTRACT(MONTH FROM o.order_date) - EXTRACT(MONTH FROM c.cohort_month))
          )::integer AS month_index,
          COUNT(DISTINCT o.customer_id)::bigint AS month_users,
          SUM(o.order_total)::bigint AS month_revenue
        FROM active_orders o
        JOIN customer_span c ON c.customer_id = o.customer_id
        GROUP BY c.cohort_month, month_index
      ),
      cohort_summary AS (
        SELECT
          s.cohort_month,
          COUNT(*)::bigint AS new_customers,
          (COUNT(*) FILTER (WHERE s.last_month > s.cohort_month))::bigint AS returning_customers
        FROM customer_span s
        GROUP BY s.cohort_month
      ),
      -- Revenue cohort diturunkan dari monthly_activity: month_index > 0 identik
      -- dengan "bulan order > cohort_month", jadi tabel order tidak dibaca ulang.
      cohort_revenue AS (
        SELECT
          cohort_month,
          COALESCE(SUM(month_revenue), 0)::bigint AS total_sales,
          COALESCE(SUM(month_revenue) FILTER (WHERE month_index > 0), 0)::bigint AS retained_revenue
        FROM monthly_activity
        GROUP BY cohort_month
      ),
      monthly AS (
        SELECT
          s.cohort_month,
          m.month_index,
          COALESCE(a.month_users, 0)::bigint AS month_users,
          COALESCE(a.month_revenue, 0)::bigint AS month_revenue
        FROM cohort_summary s
        CROSS JOIN dataset d
        CROSS JOIN LATERAL generate_series(
          0,
          LEAST(
            ${LEGACY_MAX_MONTH},
            (
              (EXTRACT(YEAR FROM d.as_of_date) - EXTRACT(YEAR FROM s.cohort_month)) * 12 +
              (EXTRACT(MONTH FROM d.as_of_date) - EXTRACT(MONTH FROM s.cohort_month))
            )::integer
          )
        ) AS m(month_index)
        LEFT JOIN monthly_activity a
          ON a.cohort_month = s.cohort_month
          AND a.month_index = m.month_index
      ),
      retention_average AS (
        SELECT
          m.cohort_month,
          AVG((m.month_users::numeric / NULLIF(s.new_customers, 0)) * 100)
            FILTER (WHERE m.month_index > 0) AS average_retention
        FROM monthly m
        JOIN cohort_summary s ON s.cohort_month = m.cohort_month
        GROUP BY m.cohort_month
      )
      SELECT
        to_char(s.cohort_month, 'YYYY-MM') AS cohort,
        r.total_sales::text AS total_sales,
        s.new_customers::text AS new_customers,
        s.returning_customers::text AS returning_customers,
        r.retained_revenue::text AS retained_revenue,
        COALESCE(a.average_retention, 0)::text AS average_retention,
        (s.returning_customers::numeric / NULLIF(s.new_customers, 0) * 100)::text AS retention_ratio,
        m.month_index,
        m.month_users::text AS month_users,
        m.month_revenue::text AS month_revenue,
        (m.month_users::numeric / NULLIF(s.new_customers, 0) * 100)::text AS month_ratio,
        (date_trunc('month', d.as_of_date)::date =
          (s.cohort_month + make_interval(months => m.month_index))::date) AS partial
      FROM cohort_summary s
      JOIN cohort_revenue r ON r.cohort_month = s.cohort_month
      JOIN monthly m ON m.cohort_month = s.cohort_month
      LEFT JOIN retention_average a ON a.cohort_month = s.cohort_month
      CROSS JOIN dataset d
      WHERE m.month_index BETWEEN 0 AND ${LEGACY_MAX_MONTH}
      ORDER BY s.cohort_month, m.month_index
    `),
  ]);

  const rows = buildRetentionRows(
    result.rows.map((row) => ({
      cohort: row.cohort,
      totalSales: BigInt(row.total_sales),
      newCustomers: Number(row.new_customers),
      returningCustomers: Number(row.returning_customers),
      retainedRevenue: BigInt(row.retained_revenue),
      averageRetention: Number(row.average_retention),
      retentionRatio: Number(row.retention_ratio),
      monthIndex: row.month_index,
      monthUsers: row.month_users === null ? null : Number(row.month_users),
      monthRevenue: row.month_revenue === null ? null : BigInt(row.month_revenue),
      monthRatio: row.month_ratio === null ? null : Number(row.month_ratio),
      partial: row.partial,
    })),
    LEGACY_MAX_MONTH
  );
  const cohortCustomers = rows.reduce((sum, row) => sum + row.newCustomers, 0);
  const returningCustomers = rows.reduce(
    (sum, row) => sum + row.returningCustomers,
    0
  );
  const m1 = rows.flatMap((row) => (row.months[1] ? [row.months[1].ratio] : []));

  return {
    asOfDate: asOfResult.rows[0]?.as_of_date ?? null,
    maxMonth: LEGACY_MAX_MONTH,
    averageM1Retention: m1.length
      ? m1.reduce((sum, value) => sum + value, 0) / m1.length
      : 0,
    cohortCustomers,
    returningCustomers,
    rows,
  };
}

export async function getFrequencyAnalytics(): Promise<FrequencyAnalytics> {
  const db = getDb();
  const [asOfResult, distributionResult, funnelResult] = await Promise.all([
    db.execute<{ as_of_date: string | null }>(sql`
      SELECT MAX(o.order_date)::text AS as_of_date
      FROM orders o
      WHERE ${HAS_ACTIVE_DATASET}
    `),
    db.execute<DistributionDbRow>(sql`
      WITH active_orders AS (
        SELECT o.customer_id FROM orders o WHERE ${HAS_ACTIVE_DATASET}
      ),
      frequency AS (
        SELECT customer_id, COUNT(*)::integer AS total_orders
        FROM active_orders
        GROUP BY customer_id
      ),
      buckets(bucket, sort_order) AS (
        VALUES ('F1', 1), ('F2', 2), ('F3', 3), ('F4', 4), ('F5+', 5)
      ),
      counts AS (
        SELECT
          CASE WHEN total_orders >= 5 THEN 'F5+' ELSE 'F' || total_orders::text END AS bucket,
          COUNT(*)::bigint AS customers
        FROM frequency
        GROUP BY bucket
      )
      SELECT b.bucket, COALESCE(c.customers, 0)::text AS customers
      FROM buckets b
      LEFT JOIN counts c ON c.bucket = b.bucket
      ORDER BY b.sort_order
    `),
    db.execute<FrequencyDbRow>(sql`
      WITH active_orders AS (
        ${CANONICAL_ORDERS}
      ),
      ranked AS (
        SELECT
          o.*,
          ROW_NUMBER() OVER (
            PARTITION BY o.customer_id ORDER BY o.order_date, o.customer_id
          )::integer AS order_number,
          date_trunc('month', MIN(o.order_date) OVER (PARTITION BY o.customer_id))::date AS cohort_month
        FROM active_orders o
      ),
      cohort_sizes AS (
        SELECT cohort_month, COUNT(DISTINCT customer_id)::bigint AS cohort_size
        FROM ranked
        GROUP BY cohort_month
      )
      SELECT
        to_char(r.cohort_month, 'YYYY-MM') AS cohort,
        c.cohort_size::text AS cohort_size,
        r.order_number,
        COUNT(*)::bigint::text AS users,
        SUM(r.order_total)::bigint::text AS revenue,
        (COUNT(*)::numeric / NULLIF(c.cohort_size, 0) * 100)::text AS ratio
      FROM ranked r
      JOIN cohort_sizes c ON c.cohort_month = r.cohort_month
      GROUP BY r.cohort_month, c.cohort_size, r.order_number
      ORDER BY r.cohort_month, r.order_number
    `),
  ]);
  const maxOrder = funnelResult.rows.reduce(
    (max, row) => Math.max(max, row.order_number ?? 0),
    0
  );

  return {
    asOfDate: asOfResult.rows[0]?.as_of_date ?? null,
    maxOrder,
    distribution: distributionResult.rows.map((row) => ({
      bucket: row.bucket,
      customers: Number(row.customers),
    })),
    rows: buildFrequencyRows(
      funnelResult.rows.map((row) => ({
        cohort: row.cohort,
        cohortSize: Number(row.cohort_size),
        orderNumber: row.order_number,
        users: row.users === null ? null : Number(row.users),
        revenue: row.revenue === null ? null : BigInt(row.revenue),
        ratio: row.ratio === null ? null : Number(row.ratio),
      })),
      maxOrder
    ),
  };
}

/** CASE WHEN recency_days BETWEEN a AND b THEN 'label' ... END — dari RECENCY_BUCKETS. */
const RECENCY_BUCKET_CASE = sql.join(
  [
    sql`CASE`,
    ...RECENCY_BUCKETS.map((bucket) =>
      bucket.max === null
        ? sql`WHEN recency_days >= ${bucket.min} THEN ${bucket.label}`
        : sql`WHEN recency_days BETWEEN ${bucket.min} AND ${bucket.max} THEN ${bucket.label}`
    ),
    sql`END`,
  ],
  sql` `
);

/** CASE WHEN monetary BETWEEN a AND b THEN 'label' ... END — dari MONETARY_BUCKETS. */
const MONETARY_BUCKET_CASE = sql.join(
  [
    sql`CASE`,
    ...MONETARY_BUCKETS.map((bucket) =>
      bucket.max === null
        ? sql`WHEN monetary >= ${bucket.min} THEN ${bucket.label}`
        : sql`WHEN monetary BETWEEN ${bucket.min} AND ${bucket.max} THEN ${bucket.label}`
    ),
    sql`END`,
  ],
  sql` `
);

const FREQUENCY_BUCKET_CASE = sql`CASE WHEN frequency >= 5 THEN 'F5+' ELSE 'F' || frequency::text END`;

export async function getRfmAnalytics(): Promise<RfmAnalytics> {
  const db = getDb();
  const [asOfResult, kpiResult, recencyResult, monetaryResult, heatmapResult] = await Promise.all([
    db.execute<{ as_of_date: string | null }>(sql`
      SELECT MAX(o.order_date)::text AS as_of_date FROM orders o WHERE ${HAS_ACTIVE_DATASET}
    `),
    db.execute<{
      eligible: string;
      needs_review: string;
      avg_recency: string | null;
      avg_frequency: string | null;
      avg_monetary: string | null;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE cc.cluster_code IS DISTINCT FROM 'NEEDS_REVIEW')::text AS eligible,
        COUNT(*) FILTER (WHERE cc.cluster_code = 'NEEDS_REVIEW')::text AS needs_review,
        AVG(r.recency_days)::text AS avg_recency,
        AVG(r.frequency)::text AS avg_frequency,
        AVG(r.monetary)::text AS avg_monetary
      FROM customer_rfm_current r
      LEFT JOIN customer_cluster_current cc ON cc.customer_id = r.customer_id
      WHERE ${HAS_ACTIVE_DATASET} AND ${HAS_PROBETES_ORDER}
    `),
    db.execute<{ bucket: string; customers: string }>(sql`
      SELECT ${RECENCY_BUCKET_CASE} AS bucket, COUNT(*)::text AS customers
      FROM customer_rfm_current r
      WHERE ${HAS_ACTIVE_DATASET} AND ${HAS_PROBETES_ORDER}
      GROUP BY 1
    `),
    db.execute<{ bucket: string; customers: string }>(sql`
      SELECT ${MONETARY_BUCKET_CASE} AS bucket, COUNT(*)::text AS customers
      FROM customer_rfm_current r
      WHERE ${HAS_ACTIVE_DATASET} AND ${HAS_PROBETES_ORDER}
      GROUP BY 1
    `),
    db.execute<{ recency_bucket: string; frequency_bucket: string; customers: string }>(sql`
      SELECT
        ${RECENCY_BUCKET_CASE} AS recency_bucket,
        ${FREQUENCY_BUCKET_CASE} AS frequency_bucket,
        COUNT(*)::text AS customers
      FROM customer_rfm_current r
      WHERE ${HAS_ACTIVE_DATASET} AND ${HAS_PROBETES_ORDER}
      GROUP BY 1, 2
    `),
  ]);

  function distributionInOrder(
    rows: { bucket: string; customers: string }[],
    order: readonly { label: string }[]
  ) {
    const byBucket = new Map(rows.map((row) => [row.bucket, Number(row.customers)]));
    return order.map((bucket) => ({ bucket: bucket.label, customers: byBucket.get(bucket.label) ?? 0 }));
  }

  const heatmapLookup = new Map(
    heatmapResult.rows.map((row) => [`${row.recency_bucket}|${row.frequency_bucket}`, Number(row.customers)])
  );
  const heatmap = RECENCY_BUCKETS.map((recencyBucket) =>
    RFM_FREQUENCY_BUCKETS.map(
      (frequencyBucket) => heatmapLookup.get(`${recencyBucket.label}|${frequencyBucket}`) ?? 0
    )
  );

  const kpi = kpiResult.rows[0];
  return {
    asOfDate: asOfResult.rows[0]?.as_of_date ?? null,
    eligibleCustomers: Number(kpi?.eligible ?? 0),
    needsReviewCustomers: Number(kpi?.needs_review ?? 0),
    avgRecencyDays: Number(kpi?.avg_recency ?? 0),
    avgFrequency: Number(kpi?.avg_frequency ?? 0),
    avgMonetary: Number(kpi?.avg_monetary ?? 0),
    recencyDistribution: distributionInOrder(recencyResult.rows, RECENCY_BUCKETS),
    monetaryDistribution: distributionInOrder(monetaryResult.rows, MONETARY_BUCKETS),
    heatmap,
  };
}

/**
 * Filter tanggal Dashboard — DISPLAY-ONLY, sengaja dibatasi ke `totalOrderValue`
 * dan `monthlyTrend` (murni agregat order, "riwayat penjualan per periode").
 * `eligibleCustomers`/`avgFrequency`/`avgMonetary` TIDAK PERNAH ikut difilter di
 * sini — itu angka RFM/cluster yang dilindungi (docs/07-OPEN-QUESTIONS.md Q16),
 * selalu dihitung dari seluruh histori per as_of_date, sama seperti halaman
 * Cluster/RFM/Cohort/Frequency. Lihat CLAUDE.md aturan #6.
 */
export interface DashboardDateFilter {
  dateFrom?: string;
  dateTo?: string;
}

function orderDateCondition(filter?: DashboardDateFilter): SQL {
  const conditions: SQL[] = [];
  if (filter?.dateFrom) conditions.push(sql`order_date >= ${filter.dateFrom}::date`);
  if (filter?.dateTo) conditions.push(sql`order_date <= ${filter.dateTo}::date`);
  if (!conditions.length) return sql`true`;
  return conditions.reduce((acc, condition, index) => (index === 0 ? condition : sql`${acc} AND ${condition}`));
}

export async function getDashboardSummary(filter?: DashboardDateFilter): Promise<DashboardSummary> {
  const db = getDb();
  const dateCondition = orderDateCondition(filter);
  const [asOfResult, kpiResult, monthlyResult, activeBatchResult] = await Promise.all([
    db.execute<{ as_of_date: string | null }>(sql`
      SELECT MAX(o.order_date)::text AS as_of_date FROM orders o WHERE ${HAS_ACTIVE_DATASET}
    `),
    db.execute<{
      eligible: string;
      needs_review: string;
      total_order_value: string | null;
      avg_frequency: string | null;
      avg_monetary: string | null;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE cc.cluster_code IS DISTINCT FROM 'NEEDS_REVIEW')::text AS eligible,
        COUNT(*) FILTER (WHERE cc.cluster_code = 'NEEDS_REVIEW')::text AS needs_review,
        (SELECT COALESCE(SUM(order_total), 0) FROM orders WHERE ${HAS_ACTIVE_DATASET} AND ${dateCondition})::text AS total_order_value,
        AVG(r.frequency)::text AS avg_frequency,
        AVG(r.monetary)::text AS avg_monetary
      FROM customer_rfm_current r
      LEFT JOIN customer_cluster_current cc ON cc.customer_id = r.customer_id
      WHERE ${HAS_ACTIVE_DATASET} AND ${HAS_PROBETES_ORDER}
    `),
    db.execute<{ month: string; customers: string; revenue: string }>(sql`
      SELECT
        to_char(date_trunc('month', o.order_date), 'YYYY-MM') AS month,
        COUNT(DISTINCT o.customer_id)::text AS customers,
        SUM(o.order_total)::text AS revenue
      FROM orders o
      WHERE ${HAS_ACTIVE_DATASET} AND ${dateCondition}
      GROUP BY 1
      ORDER BY 1
    `),
    db.execute<{ valid_rows: number; excluded_rows: number; needs_review_rows: number; total_rows: number; as_of_date: string }>(sql`
      SELECT valid_rows, excluded_rows, needs_review_rows, total_rows, as_of_date::text
      FROM import_batches
      WHERE source_type = 'DATABASE_ALL' AND is_active = true
      LIMIT 1
    `),
  ]);

  const monthLabelFormatter = new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit" });
  const monthlyTrend: MonthlyTrendItem[] = monthlyResult.rows.map((row) => ({
    month: row.month,
    monthLabel: monthLabelFormatter.format(new Date(`${row.month}-01T00:00:00Z`)),
    customers: Number(row.customers),
    revenue: BigInt(row.revenue),
  }));

  const kpi = kpiResult.rows[0];
  const batch = activeBatchResult.rows[0];

  return {
    asOfDate: asOfResult.rows[0]?.as_of_date ?? null,
    eligibleCustomers: Number(kpi?.eligible ?? 0),
    totalOrderValue: BigInt(kpi?.total_order_value ?? "0"),
    avgFrequency: Number(kpi?.avg_frequency ?? 0),
    avgMonetary: Number(kpi?.avg_monetary ?? 0),
    monthlyTrend,
    // Diisi oleh server action pemanggil (loadDashboardSummary) dari getFrequencyAnalytics() —
    // dua query berbeda tabel, tidak digabung di sini supaya masing-masing tetap fokus.
    frequencyDistribution: [],
    dataHealth: batch
      ? {
          validRows: batch.valid_rows,
          excludedRows: batch.excluded_rows,
          unknownProductItems: batch.needs_review_rows,
          needsReviewCustomers: Number(kpi?.needs_review ?? 0),
        }
      : null,
    activeSources: {
      databaseAll: batch ? { rows: batch.total_rows, asOfDate: batch.as_of_date } : null,
    },
  };
}
