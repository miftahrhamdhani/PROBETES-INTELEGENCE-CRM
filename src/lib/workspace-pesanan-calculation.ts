/**
 * SHARED — Rumus KPI Pesanan (docs prompt §4, §6.3.6). Pure function, BIGINT
 * rupiah (ATURAN MUTLAK #7 — tidak pernah float), tanpa I/O. Testable tanpa DB.
 */
import type { WorkspaceItemType, WorkspacePaymentMethod } from "./workspace-pesanan-contracts";

export class NegativeOrderTotalError extends Error {
  constructor() {
    super("TOTAL tidak boleh bernilai negatif");
    this.name = "NegativeOrderTotalError";
  }
}

export interface WorkspaceOrderCalcItemInput {
  itemType: WorkspaceItemType;
  quantity: bigint;
  sellingPrice: bigint;
  unitHpp: bigint;
}

export interface WorkspaceOrderCalcInput {
  items: WorkspaceOrderCalcItemInput[];
  shippingCharge: bigint;
  packingCharge: bigint;
  discount: bigint;
  codAdmin: bigint;
  crmVoucher: bigint;
  paymentMethod: WorkspacePaymentMethod;
}

export interface WorkspaceOrderCalcItemResult {
  totalSalesValue: bigint;
  totalHpp: bigint;
}

export interface WorkspaceOrderCalcResult {
  items: WorkspaceOrderCalcItemResult[];
  totalSalesValue: bigint;
  cosSale: bigint;
  cosBonus: bigint;
  totalCos: bigint;
  effectiveCodAdmin: bigint;
  orderTotal: bigint;
  codValue: bigint;
}

/** SALE menambah Total Sales & COS; BONUS/SAMPLE hanya menambah COS (§4.2/§4.3/§6.3.3). */
export function calculateWorkspaceOrderItem(item: WorkspaceOrderCalcItemInput): WorkspaceOrderCalcItemResult {
  const totalSalesValue = item.itemType === "SALE" ? item.quantity * item.sellingPrice : 0n;
  const totalHpp = item.quantity * item.unitHpp;
  return { totalSalesValue, totalHpp };
}

export function calculateWorkspaceOrder(input: WorkspaceOrderCalcInput): WorkspaceOrderCalcResult {
  const items = input.items.map(calculateWorkspaceOrderItem);

  let totalSalesValue = 0n;
  let cosSale = 0n;
  let cosBonus = 0n;
  input.items.forEach((item, index) => {
    const result = items[index]!;
    totalSalesValue += result.totalSalesValue;
    if (item.itemType === "SALE") cosSale += result.totalHpp;
    else cosBonus += result.totalHpp;
  });
  const totalCos = cosSale + cosBonus;

  // Admin COD otomatis nol untuk Transfer, terlepas dari nilai yang dikirim client (§6.3.4).
  const effectiveCodAdmin = input.paymentMethod === "TRANSFER" ? 0n : input.codAdmin;

  const orderTotal = totalSalesValue + input.shippingCharge + input.packingCharge + effectiveCodAdmin - input.discount - input.crmVoucher;
  if (orderTotal < 0n) throw new NegativeOrderTotalError();

  const codValue = input.paymentMethod === "COD" ? orderTotal : 0n;

  return { items, totalSalesValue, cosSale, cosBonus, totalCos, effectiveCodAdmin, orderTotal, codValue };
}

/** Pendapatan Bersih periode (§4.6) — N/A bila COM tidak diketahui (bukan 0 diam-diam). */
export function calculatePendapatanBersih(nilaiTransaksi: bigint, cos: bigint, com: bigint): bigint {
  return nilaiTransaksi - cos - com;
}

/** AOV (Average Order Value) = Total Sales periode ÷ Jumlah Pesanan CONFIRMED
 *  periode — pembilang memakai definisi "Total Sales" yang SAMA dengan kartu
 *  KPI Total Sales (SUM item SALE saja, bukan order_total yang sudah memuat
 *  ongkir/diskon/voucher), supaya kedua angka tetap konsisten satu sama lain.
 *  BigInt truncates toward zero (mis. Rp100.001 / 3 pesanan -> Rp33.333, sisa
 *  Rp2 hilang) — cukup untuk kartu ringkasan, bukan rekonsiliasi akuntansi.
 *  0 pesanan -> 0 (bukan dibagi nol), konsisten dengan Total Sales yang juga
 *  tampil Rp0 saat periode kosong. */
export function calculateAov(totalSales: bigint, jumlahPesanan: number): bigint {
  if (jumlahPesanan <= 0) return 0n;
  return totalSales / BigInt(jumlahPesanan);
}
