import type {
  FrequencyCell,
  FrequencyRow,
  RetentionCell,
  RetentionRow,
} from "@/lib/analytics-types";

export interface RetentionQueryRow {
  cohort: string;
  totalSales: bigint;
  newCustomers: number;
  returningCustomers: number;
  retainedRevenue: bigint;
  averageRetention: number;
  retentionRatio: number;
  monthIndex: number | null;
  monthUsers: number | null;
  monthRevenue: bigint | null;
  monthRatio: number | null;
  partial: boolean | null;
}

export interface FrequencyQueryRow {
  cohort: string;
  cohortSize: number;
  orderNumber: number | null;
  users: number | null;
  revenue: bigint | null;
  ratio: number | null;
}

export function buildRetentionRows(
  source: readonly RetentionQueryRow[],
  maxMonth: number
): RetentionRow[] {
  const rows = new Map<string, RetentionRow>();

  for (const item of source) {
    const row = rows.get(item.cohort) ?? {
      cohort: item.cohort,
      totalSales: item.totalSales,
      newCustomers: item.newCustomers,
      returningCustomers: item.returningCustomers,
      retainedRevenue: item.retainedRevenue,
      averageRetention: item.averageRetention,
      retentionRatio: item.retentionRatio,
      months: Array<RetentionCell | null>(maxMonth + 1).fill(null),
    };

    if (
      item.monthIndex !== null &&
      item.monthIndex >= 0 &&
      item.monthIndex <= maxMonth
    ) {
      row.months[item.monthIndex] = {
        users: item.monthUsers ?? 0,
        revenue: item.monthRevenue ?? 0n,
        ratio: item.monthRatio ?? 0,
        partial: item.partial ?? false,
      };
    }
    rows.set(item.cohort, row);
  }

  return [...rows.values()];
}

export function buildFrequencyRows(
  source: readonly FrequencyQueryRow[],
  maxOrder: number
): FrequencyRow[] {
  const rows = new Map<string, FrequencyRow>();

  for (const item of source) {
    const row = rows.get(item.cohort) ?? {
      cohort: item.cohort,
      cohortSize: item.cohortSize,
      orders: Array<FrequencyCell | null>(maxOrder).fill(null),
    };

    if (
      item.orderNumber !== null &&
      item.orderNumber >= 1 &&
      item.orderNumber <= maxOrder
    ) {
      row.orders[item.orderNumber - 1] = {
        users: item.users ?? 0,
        revenue: item.revenue ?? 0n,
        ratio: item.ratio ?? 0,
      };
    }
    rows.set(item.cohort, row);
  }

  return [...rows.values()];
}
