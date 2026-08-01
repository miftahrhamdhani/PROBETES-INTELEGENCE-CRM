/** Cluster Dhp-New / Dhp-Old — priority 50 / 51. docs/02-CLUSTER-RULES.md §5. */
import { yearMonthOf } from "../../normalize/date";
import { LIFECYCLE_START_DATE, type ClusterRuleFn } from "../types";
import { makeAssignment } from "./_helpers";

export const checkDhp: ClusterRuleFn = (f, ctx) => {
  if (!f.firstOrderDate || f.firstOrderDate < LIFECYCLE_START_DATE) return null;
  if (f.frequency !== 1) return null;
  if (!f.firstOrder?.containsHpOrAmandia) return null;
  if (f.hasGroup !== "NOT_GROUPED") return null;

  const first = yearMonthOf(f.firstOrderDate);
  const asOf = yearMonthOf(ctx.asOfDate);
  const sameMonth = first.year === asOf.year && first.month === asOf.month;
  const code = sameMonth ? "DHP_NEW" : "DHP_OLD";

  return makeAssignment(code, ctx, [
    { label: `first_order_date >= ${LIFECYCLE_START_DATE}`, passed: true, actual: f.firstOrderDate },
    { label: "Frequency = 1, first order HP/Amandia", passed: true, actual: true },
    { label: "Belum masuk Grup", passed: true, actual: f.hasGroup },
    { label: sameMonth ? "Bulan first order = bulan berjalan" : "Bulan first order < bulan berjalan", passed: true, actual: `${first.year}-${first.month}` },
  ]);
};
