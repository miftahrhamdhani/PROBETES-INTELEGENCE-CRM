/** Cluster D-New / D-Old — priority 40 / 41. docs/02-CLUSTER-RULES.md §5. */
import { D_NEW_MAX_AGE_DAYS, LIFECYCLE_START_DATE, type ClusterRuleFn } from "../types";
import { makeAssignment } from "./_helpers";

export const checkD: ClusterRuleFn = (f, ctx) => {
  if (!f.firstOrderDate || f.firstOrderDate < LIFECYCLE_START_DATE) return null;
  if (f.hasGroup !== "NOT_GROUPED") return null;

  const oneOrderEbook = f.frequency === 1 && f.firstOrder?.isEbookOnly === true;
  const twoOrdersEbook =
    f.frequency === 2 && f.firstOrder?.isEbookOnly === true && f.secondOrder?.isEbookOnly === true;
  if (!oneOrderEbook && !twoOrdersEbook) return null;
  if (f.customerAgeDays === null) return null;

  const code = f.customerAgeDays <= D_NEW_MAX_AGE_DAYS ? "D_NEW" : "D_OLD";
  return makeAssignment(code, ctx, [
    { label: `first_order_date >= ${LIFECYCLE_START_DATE}`, passed: true, actual: f.firstOrderDate },
    { label: "Belum masuk Grup", passed: true, actual: f.hasGroup },
    { label: "F1 Ebook, atau F2 Ebook+Ebook", passed: true, actual: f.frequency },
    { label: `customer_age_days ${code === "D_NEW" ? "<=" : ">"} ${D_NEW_MAX_AGE_DAYS}`, passed: true, actual: f.customerAgeDays },
  ]);
};
