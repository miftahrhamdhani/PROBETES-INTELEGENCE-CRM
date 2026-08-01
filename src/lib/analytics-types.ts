export interface RetentionCell {
  users: number;
  revenue: bigint;
  ratio: number;
  partial: boolean;
}

export interface RetentionRow {
  cohort: string;
  totalSales: bigint;
  newCustomers: number;
  returningCustomers: number;
  retainedRevenue: bigint;
  averageRetention: number;
  retentionRatio: number;
  months: Array<RetentionCell | null>;
}

export interface RetentionAnalytics {
  asOfDate: string | null;
  maxMonth: number;
  averageM1Retention: number;
  cohortCustomers: number;
  returningCustomers: number;
  rows: RetentionRow[];
}

export interface FrequencyCell {
  users: number;
  revenue: bigint;
  ratio: number;
}

export interface FrequencyRow {
  cohort: string;
  cohortSize: number;
  orders: Array<FrequencyCell | null>;
}

export interface FrequencyDistributionItem {
  bucket: "F1" | "F2" | "F3" | "F4" | "F5+";
  customers: number;
}

export interface FrequencyAnalytics {
  asOfDate: string | null;
  maxOrder: number;
  distribution: FrequencyDistributionItem[];
  rows: FrequencyRow[];
}

/** Batas bucket recency (hari) — dipakai label chart & filter drill-down. */
export const RECENCY_BUCKETS = [
  { label: "0–30", min: 0, max: 30 },
  { label: "31–60", min: 31, max: 60 },
  { label: "61–90", min: 61, max: 90 },
  { label: "91–180", min: 91, max: 180 },
  { label: "181–365", min: 181, max: 365 },
  { label: "365+", min: 366, max: null },
] as const;

/** Batas bucket monetary (rupiah) — dipakai label chart & filter drill-down. */
export const MONETARY_BUCKETS = [
  { label: "<250rb", min: 0, max: 249_999 },
  { label: "250–500rb", min: 250_000, max: 499_999 },
  { label: "500rb–1jt", min: 500_000, max: 999_999 },
  { label: "1–1,5jt", min: 1_000_000, max: 1_499_999 },
  { label: ">1,5jt", min: 1_500_000, max: null },
] as const;

export const RFM_FREQUENCY_BUCKETS = ["F1", "F2", "F3", "F4", "F5+"] as const;

export interface RfmDistributionItem {
  bucket: string;
  customers: number;
}

export interface RfmAnalytics {
  asOfDate: string | null;
  eligibleCustomers: number;
  needsReviewCustomers: number;
  avgRecencyDays: number;
  avgFrequency: number;
  avgMonetary: number;
  recencyDistribution: RfmDistributionItem[];
  monetaryDistribution: RfmDistributionItem[];
  /** matrix[recencyBucketIndex][frequencyBucketIndex] = jumlah customer. */
  heatmap: number[][];
}

export interface MonthlyTrendItem {
  month: string; // YYYY-MM
  monthLabel: string; // "Agu 25"
  customers: number;
  revenue: bigint;
}

export interface DashboardSummary {
  asOfDate: string | null;
  eligibleCustomers: number;
  totalOrderValue: bigint;
  avgFrequency: number;
  avgMonetary: number;
  monthlyTrend: MonthlyTrendItem[];
  frequencyDistribution: FrequencyDistributionItem[];
  dataHealth: {
    validRows: number;
    excludedRows: number;
    unknownProductItems: number;
    needsReviewCustomers: number;
  } | null;
  activeSources: {
    databaseAll: { rows: number; asOfDate: string } | null;
  };
}
