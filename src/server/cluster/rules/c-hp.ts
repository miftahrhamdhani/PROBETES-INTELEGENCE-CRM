/** Cluster C-HP — priority 31. docs/02-CLUSTER-RULES.md §5. */
import { LIFECYCLE_START_DATE, type ClusterRuleFn } from "../types";
import { makeAssignment } from "./_helpers";

export const checkCHp: ClusterRuleFn = (f, ctx) => {
  if (!f.firstOrderDate || f.firstOrderDate < LIFECYCLE_START_DATE) return null;
  if (f.frequency !== 1) return null;
  if (!f.firstOrder?.containsHpOrAmandia) return null;
  if (f.hasGroup !== "GROUPED") return null;

  return makeAssignment("C_HP", ctx, [
    { label: `first_order_date >= ${LIFECYCLE_START_DATE}`, passed: true, actual: f.firstOrderDate },
    { label: "Frequency = 1", passed: true, actual: f.frequency },
    { label: "First order mengandung HP/Amandia", passed: true, actual: true },
    { label: "Sudah masuk Grup", passed: true, actual: f.hasGroup },
  ]);
};
