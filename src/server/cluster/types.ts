/**
 * Tipe untuk cluster rule engine. Fungsi murni — tanpa I/O, tanpa Date.now().
 * Sumber aturan: docs/02-CLUSTER-RULES.md — IMMUTABLE.
 */

import { CLUSTER_PRIORITY, type ClusterAssignmentCode, type ClusterCode } from "@/lib/cluster-codes";
import type { ProductFlags } from "../normalize/product-catalog";

/**
 * GROUPED/NOT_GROUPED = keputusan CRM eksplisit. UNKNOWN = belum ada keputusan —
 * TIDAK BOLEH diperlakukan sebagai NOT_GROUPED (lihat needsReview di features.ts).
 */
export type GroupStatus = "GROUPED" | "NOT_GROUPED" | "UNKNOWN";

export interface ClusterContext {
  /** MAX(order_date) dataset aktif — BUKAN NOW(). Lihat CLAUDE.md aturan #6. */
  asOfDate: string; // YYYY-MM-DD
  ruleVersion: string;
}

export interface RawOrderItemInput {
  amount: bigint;
  isBonus: boolean;
  productFlags: ProductFlags;
}

export interface RawOrderInput {
  date: string; // YYYY-MM-DD
  items: RawOrderItemInput[];
}

/** Kategori satu order — dipakai untuk C-Prodig/C-HP/C-F2/D/Dhp/E. Lihat §4.2. */
export interface OrderCategoryFeature {
  containsHpOrAmandia: boolean;
  /** Seluruh item (bonus diabaikan) adalah Ebook ATAU Buku Menuju Remisi. */
  isBookEntryOnly: boolean;
  /** Seluruh item (bonus diabaikan) adalah Ebook murni. */
  isEbookOnly: boolean;
  /** Ada item ber-flag UNKNOWN di order ini — pemicu NEEDS_REVIEW. */
  hasUnknownProduct: boolean;
}

/** Fitur customer yang sudah diagregasi — input tunggal untuk assignCluster(). */
export interface CustomerFeatures {
  /** Jumlah order Probetes (1 hari = 1 order, KSB sudah dikeluarkan). */
  frequency: number;
  /** SUM order_total seluruh order Probetes. */
  monetary: bigint;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
  /** asOfDate - firstOrderDate, dalam hari. */
  customerAgeDays: number | null;
  hasGroup: GroupStatus;
  /** COUNT(DISTINCT tanggal transaksi) dari ksb_transactions. */
  yaconaFrequency: number;
  firstOrder: OrderCategoryFeature | null;
  secondOrder: OrderCategoryFeature | null;
  /** true kalau TIDAK ADA order Probetes sama sekali (KSB murni / no phone dsb — ditangani di layer atas). */
  hasNeverBoughtTargetPhysical: boolean;
  /** Trigger NEEDS_REVIEW: keputusan cluster bergantung produk UNKNOWN dan/atau status grup UNKNOWN. */
  needsReview: boolean;
  /** Penyebab spesifik needsReview — dipakai engine.ts untuk reason yang akurat (bukan diagnostik tambahan, bukan rule baru). */
  needsReviewReasons: ("PRODUCT_UNKNOWN" | "GROUP_UNKNOWN")[];
}

export interface ClusterCheck {
  label: string;
  passed: boolean;
  actual: string | number | boolean | null;
}

export interface ClusterAssignment {
  clusterCode: ClusterAssignmentCode;
  ruleVersion: string;
  asOfDate: string;
  reason: {
    matchedRule: ClusterAssignmentCode;
    priority: number | null;
    checks: ClusterCheck[];
  };
}

export type ClusterRuleFn = (
  features: CustomerFeatures,
  ctx: ClusterContext
) => ClusterAssignment | null;

export const A1_MONETARY_THRESHOLD = 1_500_000n;
export const CLUSTER_B_MIN_YACONA_FREQ = 5; // ">", artinya >= 6
export const LIFECYCLE_START_DATE = "2025-11-01";
export const E_WINDOW_START = "2025-03-01";
export const E_WINDOW_END = "2025-10-31";
export const D_NEW_MAX_AGE_DAYS = 15;

export function priorityOf(code: ClusterCode): number {
  return CLUSTER_PRIORITY[code];
}
