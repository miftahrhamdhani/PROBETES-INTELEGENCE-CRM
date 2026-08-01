/**
 * Cluster E — priority 90. docs/02-CLUSTER-RULES.md §5.
 *
 * PENTING: teks aturan E tidak membatasi Frequency. Karena posisinya di priority 90
 * (setelah A2/A3/A4 di 60/70/80), customer F>=2 sudah tertangkap duluan — sehingga
 * secara efektif hanya customer F=1 yang sampai ke sini. JANGAN tambahkan syarat
 * frequency===1 di file ini — itu harus muncul dari urutan chain di engine.ts.
 */
import { E_WINDOW_END, E_WINDOW_START, type ClusterRuleFn } from "../types";
import { makeAssignment } from "./_helpers";

export const checkE: ClusterRuleFn = (f, ctx) => {
  if (!f.firstOrderDate) return null;
  if (f.firstOrderDate < E_WINDOW_START || f.firstOrderDate > E_WINDOW_END) return null;
  if (!f.firstOrder?.isEbookOnly) return null;
  if (!f.hasNeverBoughtTargetPhysical) return null;

  return makeAssignment("E", ctx, [
    { label: `first_order_date antara ${E_WINDOW_START} dan ${E_WINDOW_END}`, passed: true, actual: f.firstOrderDate },
    { label: "First order = Ebook", passed: true, actual: true },
    { label: "Tidak pernah beli produk fisik target", passed: true, actual: true },
  ]);
};
