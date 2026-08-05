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

function safeRupiah(value: number): number {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded)) throw new RangeError("Total rupiah melebihi batas aman JavaScript");
  return rounded;
}

/** Rumus existing CRM Report: jumlah qty × nilai produk, lalu ongkir + packing + admin COD - diskon. */
export function calculateCrmReportTotals(items: CrmReportCalculationItem[], costs: CrmReportCalculationCosts) {
  const totalProductValue = safeRupiah(
    items.reduce((total, item) => total + parseCrmNumber(item.qty) * parseCrmNumber(item.productValue), 0)
  );
  const totalPayment = Math.max(
    0,
    safeRupiah(
      totalProductValue +
        parseCrmNumber(costs.shippingCost) +
        parseCrmNumber(costs.packingCost) +
        parseCrmNumber(costs.adminCod) -
        parseCrmNumber(costs.discount)
    )
  );

  return { totalProductValue, totalPayment };
}
