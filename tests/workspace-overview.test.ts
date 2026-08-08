import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculatePercentageChange, previousPeriodFor, zeroFillTrendBuckets } from "@/server/workspace/pesanan-overview";
import { calculateWorkspaceOrder } from "@/lib/workspace-pesanan-calculation";

const overviewSource = readFileSync(resolve(process.cwd(), "src/server/workspace/pesanan-overview.ts"), "utf8");

describe("Workspace Overview — scope financial kanonik", () => {
  it("CONFIRMED dan PARTIALLY_REFUNDED masuk financial", () => {
    expect(overviewSource).toContain("('CONFIRMED','PARTIALLY_REFUNDED')");
  });

  it.each(["DRAFT", "CANCELLED", "RETURNED", "REFUNDED"])("%s tidak masuk scope financial", (status) => {
    const scope = overviewSource.slice(overviewSource.indexOf("const REPORTABLE_STATUSES"), overviewSource.indexOf("export function overviewOrderScope"));
    expect(scope).not.toContain(`'${status}'`);
  });

  it("refund hanya PARTIALLY_REFUNDED", () => {
    expect(overviewSource).toContain("o.status = 'PARTIALLY_REFUNDED'");
    expect(overviewSource).toContain("SUM(o.refund_amount)");
  });
});

describe("Workspace Overview — SALE/BONUS/SAMPLE", () => {
  const base = { shippingCharge: 0n, packingCharge: 0n, discount: 0n, codAdmin: 0n, crmVoucher: 0n, paymentMethod: "TRANSFER" as const };

  it("BONUS tidak menambah Sales, COS bertambah", () => {
    const result = calculateWorkspaceOrder({ ...base, items: [{ itemType: "BONUS", quantity: 2n, sellingPrice: 100000n, unitHpp: 12000n }] });
    expect(result.totalSalesValue).toBe(0n);
    expect(result.totalCos).toBe(24000n);
  });

  it("SAMPLE tidak menambah Sales, COS bertambah", () => {
    const result = calculateWorkspaceOrder({ ...base, items: [{ itemType: "SAMPLE", quantity: 3n, sellingPrice: 100000n, unitHpp: 5000n }] });
    expect(result.totalSalesValue).toBe(0n);
    expect(result.totalCos).toBe(15000n);
  });
});

describe("Workspace Overview — COM", () => {
  it("hanya DIRECTOR_APPROVED masuk COM dan komposisi", () => {
    expect(overviewSource).toContain("c.status = 'DIRECTOR_APPROVED'");
    expect(overviewSource).not.toMatch(/c\.status\s+IN\s*\(/);
  });
});

describe("Workspace Overview — dimensi harus rekonsiliasi", () => {
  it("payment composition memakai total_sales_value, bukan order_total", () => {
    const payment = overviewSource.slice(overviewSource.indexOf("export async function getPaymentComposition"), overviewSource.indexOf("export type SalesSourceRow"));
    expect(payment).toContain("SUM(i.total_sales_value)");
    expect(payment).not.toContain("order_total");
  });

  it("sales source memakai total_sales_value dan fallback Tanpa Sumber", () => {
    const source = overviewSource.slice(overviewSource.indexOf("export async function getSalesBySource"), overviewSource.indexOf("export type StatusCompositionRow"));
    expect(source).toContain("SUM(i.total_sales_value)");
    expect(source).toContain("Tanpa Sumber");
  });

  it("runtime memaksa Payment=Gross, Source=Gross, COM composition=COM, Gross-COS-COM-Refund=Net", () => {
    expect(overviewSource).toContain("paymentComposition: sumValues(paymentComposition) === gross");
    expect(overviewSource).toContain("salesBySource: sumValues(salesBySource) === gross");
    expect(overviewSource).toContain("comComposition: sumValues(comComposition) === com");
    expect(overviewSource).toContain("gross - BigInt(kpi.cos) - com - BigInt(kpi.refund) === BigInt(kpi.pendapatanBersih)");
    expect(overviewSource).toContain("throw new OverviewReconciliationError(metric)");
  });
});

describe("Workspace Overview — previous period", () => {
  it("memakai jumlah hari sama", () => {
    expect(previousPeriodFor("2026-08-01", "2026-08-05")).toEqual({ from: "2026-07-27", to: "2026-07-31" });
  });

  it("previous 0 menghasilkan null, bukan Infinity", () => {
    expect(calculatePercentageChange(100n, 0n)).toBeNull();
  });
});

describe("Workspace Overview — zero-filled trend", () => {
  it("mengisi bucket harian kosong", () => {
    expect(zeroFillTrendBuckets([{ period: "2026-08-02", revenue: "100", orderCount: 1 }], "2026-08-01", "2026-08-03", "daily")).toEqual([
      { period: "2026-08-01", revenue: "0", orderCount: 0 },
      { period: "2026-08-02", revenue: "100", orderCount: 1 },
      { period: "2026-08-03", revenue: "0", orderCount: 0 },
    ]);
  });

  it("mengisi bucket mingguan dan bulanan", () => {
    expect(zeroFillTrendBuckets([], "2026-08-05", "2026-08-20", "weekly").map((row) => row.period)).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
    expect(zeroFillTrendBuckets([], "2026-01-15", "2026-03-03", "monthly").map((row) => row.period)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
});
