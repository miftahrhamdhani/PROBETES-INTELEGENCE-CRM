export type CrmReportCalculationItem = {
  qty: string | number;
  productValue: string | number;
};

export type CrmReportCalculationCosts = {
  shippingCost: string | number;
  packingCost: string | number;
  discount: string | number;
  adminCod: string | number;
};

export function parseCrmNumber(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Rumus existing CRM Report: jumlah qty × nilai produk, lalu ongkir + packing + admin COD - diskon. */
export function calculateCrmReportTotals(items: CrmReportCalculationItem[], costs: CrmReportCalculationCosts) {
  const totalProductValue = Math.round(
    items.reduce((total, item) => total + parseCrmNumber(item.qty) * parseCrmNumber(item.productValue), 0)
  );
  const totalPayment = Math.max(
    0,
    Math.round(
      totalProductValue +
        parseCrmNumber(costs.shippingCost) +
        parseCrmNumber(costs.packingCost) +
        parseCrmNumber(costs.adminCod) -
        parseCrmNumber(costs.discount)
    )
  );

  return { totalProductValue, totalPayment };
}
