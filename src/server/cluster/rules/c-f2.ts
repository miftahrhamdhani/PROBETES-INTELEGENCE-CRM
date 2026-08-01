/** Cluster C-F2 — priority 32. docs/02-CLUSTER-RULES.md §5. Tidak ada batas tanggal. */
import type { ClusterRuleFn } from "../types";
import { makeAssignment } from "./_helpers";

export const checkCF2: ClusterRuleFn = (f, ctx) => {
  if (f.frequency !== 2) return null;
  if (!f.firstOrder?.isEbookOnly) return null;
  if (!f.secondOrder?.isEbookOnly) return null;
  if (f.hasGroup !== "GROUPED") return null;

  return makeAssignment("C_F2", ctx, [
    { label: "Frequency = 2", passed: true, actual: f.frequency },
    { label: "Order 1 & 2 = Ebook murni", passed: true, actual: true },
    { label: "Sudah masuk Grup", passed: true, actual: f.hasGroup },
  ]);
};
