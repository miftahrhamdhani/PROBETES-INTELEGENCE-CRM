import { describe, expect, it } from "vitest";
import { buildFrequencyRows, buildRetentionRows } from "@/server/analytics/transform";

describe("transformasi analytics", () => {
  it("membentuk retention M0-M24 tanpa mengubah bigint rupiah", () => {
    const rows = buildRetentionRows([
      {
        cohort: "2026-01",
        totalSales: 1_500_000n,
        newCustomers: 2,
        returningCustomers: 1,
        retainedRevenue: 500_000n,
        averageRetention: 25,
        retentionRatio: 50,
        monthIndex: 0,
        monthUsers: 2,
        monthRevenue: 1_000_000n,
        monthRatio: 100,
        partial: false,
      },
      {
        cohort: "2026-01",
        totalSales: 1_500_000n,
        newCustomers: 2,
        returningCustomers: 1,
        retainedRevenue: 500_000n,
        averageRetention: 25,
        retentionRatio: 50,
        monthIndex: 1,
        monthUsers: 1,
        monthRevenue: 500_000n,
        monthRatio: 50,
        partial: true,
      },
    ], 24);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.months).toHaveLength(25);
    expect(rows[0]?.months[0]).toEqual({ users: 2, revenue: 1_000_000n, ratio: 100, partial: false });
    expect(rows[0]?.months[1]).toEqual({ users: 1, revenue: 500_000n, ratio: 50, partial: true });
    expect(rows[0]?.months[24]).toBeNull();
  });

  it("mengabaikan index retention dan frequency di luar batas", () => {
    const retention = buildRetentionRows([{
      cohort: "2026-01", totalSales: 0n, newCustomers: 1, returningCustomers: 0,
      retainedRevenue: 0n, averageRetention: 0, retentionRatio: 0,
      monthIndex: -1, monthUsers: 1, monthRevenue: 0n, monthRatio: 100, partial: false,
    }], 24);
    const frequency = buildFrequencyRows([{
      cohort: "2026-01", cohortSize: 1, orderNumber: 0, users: 1, revenue: 0n, ratio: 100,
    }], 2);

    expect(retention[0]?.months.every((cell) => cell === null)).toBe(true);
    expect(frequency[0]?.orders.every((cell) => cell === null)).toBe(true);
  });

  it("membentuk funnel dinamis sesuai order maksimum", () => {
    const rows = buildFrequencyRows([
      { cohort: "2026-01", cohortSize: 3, orderNumber: 1, users: 3, revenue: 300_000n, ratio: 100 },
      { cohort: "2026-01", cohortSize: 3, orderNumber: 3, users: 1, revenue: 100_000n, ratio: 33.333 },
    ], 3);

    expect(rows[0]?.orders).toEqual([
      { users: 3, revenue: 300_000n, ratio: 100 },
      null,
      { users: 1, revenue: 100_000n, ratio: 33.333 },
    ]);
  });
});
