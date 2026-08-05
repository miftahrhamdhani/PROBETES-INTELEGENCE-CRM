import { describe, expect, it } from "vitest";
import { calculateCrmReportTotals } from "@/lib/crm-report-calculation";
import { crmReportSchema } from "@/lib/crm-report-contracts";

const baseReport = {
  customerName: "adimakayasa",
  phone: "081234567890",
  address: "jl. setiabudi no. 123",
  expedition: "jne",
  memo: "pesan sore",
  paymentMethod: "cod",
  items: [
    { productName: "paket nutrisi basic", qty: 2, productValue: 125_000 },
    { productName: "vitamin c", qty: 1, productValue: 75_000 },
  ],
  shippingCost: 25_000,
  packingCost: 5_000,
  discount: 10_000,
  adminCod: 2_500,
  reportDate: "2026-08-01",
  city: "bandung",
  division: "crm",
};

describe("CRM Report worksheet", () => {
  it("menggunakan rumus existing untuk total realtime dan backend", () => {
    expect(
      calculateCrmReportTotals(baseReport.items, {
        shippingCost: baseReport.shippingCost,
        packingCost: baseReport.packingCost,
        discount: baseReport.discount,
        adminCod: baseReport.adminCod,
      })
    ).toEqual({ totalProductValue: 325_000, totalPayment: 347_500 });
  });

  it("uppercase field teks pada trust boundary tanpa mengubah nomor HP", () => {
    const parsed = crmReportSchema.parse(baseReport);

    expect(parsed.customerName).toBe("ADIMAKAYASA");
    expect(parsed.phone).toBe("081234567890");
    expect(parsed.address).toBe("JL. SETIABUDI NO. 123");
    expect(parsed.items.map((item) => item.productName)).toEqual(["PAKET NUTRISI BASIC", "VITAMIN C"]);
    expect(parsed.city).toBe("BANDUNG");
    expect(parsed.division).toBe("CRM");
  });

  it("menolak nilai rupiah dan total di atas Number.MAX_SAFE_INTEGER", () => {
    expect(crmReportSchema.safeParse({ ...baseReport, shippingCost: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
    expect(() =>
      calculateCrmReportTotals([{ qty: 2, productValue: Number.MAX_SAFE_INTEGER }], {
        shippingCost: 0,
        packingCost: 0,
        discount: 0,
        adminCod: 0,
      })
    ).toThrow("batas aman JavaScript");
  });
});
