/**
 * Membangun CustomerFeatures dari raw order input.
 * Fungsi murni — tanpa I/O, tanpa Date.now(). Lihat docs/02-CLUSTER-RULES.md §3-4.
 */

import { daysBetween } from "../normalize/date";
import { LIFECYCLE_START_DATE } from "./types";
import type {
  ClusterContext,
  CustomerFeatures,
  GroupStatus,
  OrderCategoryFeature,
  RawOrderInput,
} from "./types";

function categorizeOrder(order: RawOrderInput): OrderCategoryFeature {
  const nonBonus = order.items.filter((i) => !i.isBonus);
  // Kalau semua item bonus (jarang), pakai seluruh item sebagai fallback.
  const items = nonBonus.length > 0 ? nonBonus : order.items;

  return {
    containsHpOrAmandia: items.some((i) => i.productFlags.isHpOrAmandia),
    isBookEntryOnly: items.every((i) => i.productFlags.isBookEntry),
    isEbookOnly: items.every((i) => i.productFlags.isEbook),
    hasUnknownProduct: items.some((i) => i.productFlags.code === "UNKNOWN"),
  };
}

/**
 * @param rawOrders Order Probetes customer (KSB SUDAH dikeluarkan sebelum masuk sini —
 *   lihat docs/03-ERD.md ksb_transactions, dataset terpisah).
 * @param hasGroup Status dari customer_group_memberships (GROUPED/NOT_GROUPED/keputusan
 *   CRM eksplisit; UNKNOWN kalau belum ada baris/keputusan — lihat needsReview di bawah).
 * @param yaconaFrequency COUNT(DISTINCT tanggal) dari ksb_transactions untuk customer ini.
 */
export function buildCustomerFeatures(
  rawOrders: RawOrderInput[],
  hasGroup: GroupStatus,
  yaconaFrequency: number,
  ctx: ClusterContext
): CustomerFeatures {
  const sorted = [...rawOrders].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const frequency = sorted.length;
  const monetary = sorted.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + i.amount, 0n),
    0n
  );
  const firstOrderDate = sorted[0]?.date ?? null;
  const lastOrderDate = sorted[sorted.length - 1]?.date ?? null;
  const customerAgeDays = firstOrderDate ? daysBetween(firstOrderDate, ctx.asOfDate) : null;

  const firstOrder = sorted[0] ? categorizeOrder(sorted[0]) : null;
  const secondOrder = sorted[1] ? categorizeOrder(sorted[1]) : null;

  const hasNeverBoughtTargetPhysical = !sorted.some((o) =>
    o.items.some((i) => !i.isBonus && i.productFlags.isTargetPhysical)
  );

  // NEEDS_REVIEW hanya ketika UNKNOWN dapat mengubah hasil cluster berbasis produk:
  // F1/F2 bisa menjadi C/D/Dhp/E atau A2/F tergantung mapping. Pada F>=3,
  // A3/A4 ditentukan Frequency sebelum E sehingga UNKNOWN tidak mengubah hasil.
  // A1 juga tidak bergantung produk dan ditangani sebelum NEEDS_REVIEW di engine.
  const firstTwoHaveUnknown = Boolean(firstOrder?.hasUnknownProduct || secondOrder?.hasUnknownProduct);

  // hasGroup=UNKNOWN hanya memicu NEEDS_REVIEW kalau GROUPED vs NOT_GROUPED
  // benar-benar mengubah hasil — mirror kondisi checkCProdig/checkCHp/checkCF2
  // vs checkD/checkDhp. Di luar shape ini (A1-A4/E/F/frequency>=3), status grup
  // tidak memengaruhi cluster, jadi UNKNOWN tidak perlu direview.
  const groupDependentShape =
    (frequency === 1 &&
      firstOrderDate !== null &&
      firstOrderDate >= LIFECYCLE_START_DATE &&
      Boolean(firstOrder?.isBookEntryOnly || firstOrder?.containsHpOrAmandia)) ||
    (frequency === 2 && Boolean(firstOrder?.isEbookOnly && secondOrder?.isEbookOnly));
  const groupUnknownAmbiguous = hasGroup === "UNKNOWN" && groupDependentShape;
  const productUnknownAmbiguous = frequency <= 2 && firstTwoHaveUnknown;

  const needsReviewReasons: ("PRODUCT_UNKNOWN" | "GROUP_UNKNOWN")[] = [];
  if (productUnknownAmbiguous) needsReviewReasons.push("PRODUCT_UNKNOWN");
  if (groupUnknownAmbiguous) needsReviewReasons.push("GROUP_UNKNOWN");
  const needsReview = needsReviewReasons.length > 0;

  return {
    frequency,
    monetary,
    firstOrderDate,
    lastOrderDate,
    customerAgeDays,
    hasGroup,
    yaconaFrequency,
    firstOrder,
    secondOrder,
    hasNeverBoughtTargetPhysical,
    needsReview,
    needsReviewReasons,
  };
}
