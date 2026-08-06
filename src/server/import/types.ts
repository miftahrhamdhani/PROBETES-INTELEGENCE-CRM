import type { CanonicalProductCode, ProductFlags } from "../normalize/product-catalog";

export type ImportSource = "DATABASE_ALL" | "KSB" | "GROUP_LIST";
export type ValidationCode =
  | "MISSING_PHONE"
  | "INVALID_PHONE"
  | "MISSING_NAME"
  | "MISSING_ORDER_ID"
  | "UNKNOWN_PRODUCT"
  | "INVALID_DATE"
  | "INVALID_AMOUNT"
  | "DUPLICATE_ROW";

export interface SourceRow {
  rowNumber: number;
  values: Record<string, unknown>;
}

export interface NormalizedOrderItem {
  /** Stabil antar-upload; dipakai UNIQUE agar item tidak mengganda. */
  sourceItemKey: string;
  sourceRowNumber: number;
  externalId: string | null;
  rawProductName: string;
  productFlags: ProductFlags;
  qty: string | null;
  amount: bigint;
  isBonus: boolean;
  identityConfidence: "HIGH" | "LOW";
}

export interface NormalizedDailyOrder {
  /** `${orderDate}|${normalizedPhone}` — satu hari = satu order. */
  sourceOrderKey: string;
  normalizedPhone: string;
  displayPhone: string;
  customerName: string;
  orderDate: string;
  orderTotal: bigint;
  workspaceTotal: bigint;
  platform: string;
  division: string;
  paymentMethod: string;
  partner: string;
  csName: string;
  memo: string;
  city: string;
  hub: string;
  salesType: string;
  shippingCost: bigint;
  packingCost: bigint;
  discount: bigint;
  adminCod: bigint;
  crmMarketingCost: bigint;
  orderClosingCount: number;
  transactionStatus: "CONFIRMED" | "CANCELLED" | "COD_FAILED" | "RETURNED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "ADJUSTED";
  crmClassification: {
    included: boolean;
    inclusionReason: string | null;
    exclusionReason: string | null;
    mappingVersion: string;
  };
  items: NormalizedOrderItem[];
}

export interface ExcludedRow {
  rowNumber: number;
  codes: ValidationCode[];
  raw: Record<string, unknown>;
}

export interface DatabaseAllParseResult {
  orders: NormalizedDailyOrder[];
  /** Item product_family=KSB yang ditemukan di Database All — lihat docs/02-CLUSTER-RULES.md §3.1.
   *  Dikeluarkan dari orders/order_items (di atas), tapi DITANGKAP di sini alih-alih
   *  dibuang, supaya ikut dihitung ke ksb_transactions/Cluster B (bukan hilang total). */
  ksbTransactions: NormalizedKsbTransaction[];
  excluded: ExcludedRow[];
  asOfDate: string | null;
  totalSourceRows: number;
}

export interface NormalizedKsbTransaction {
  /** Content-based, BUKAN menyertakan row number/source — supaya transaksi yang
   *  sama dari Legacy KSB maupun Database All otomatis dedup lewat unique index
   *  (fallback matching, docs percakapan reconciliation KSB). */
  sourceKey: string;
  normalizedPhone: string;
  customerName: string;
  transactionDate: string;
  productName: string;
  productCode: CanonicalProductCode;
  qty: string | null;
  amount: bigint;
  sourceRowNumber: number;
}

export interface GroupListEntry {
  normalizedPhone: string;
  name: string;
  sourceList: string;
  sourceRowNumber: number;
}
