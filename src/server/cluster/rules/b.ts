/** Cluster B — priority 10. docs/02-CLUSTER-RULES.md §5. */
import { CLUSTER_B_MIN_YACONA_FREQ, type ClusterRuleFn } from "../types";
import { makeAssignment } from "./_helpers";

export const checkB: ClusterRuleFn = (f, ctx) => {
  if (f.yaconaFrequency <= CLUSTER_B_MIN_YACONA_FREQ) return null;
  return makeAssignment("B", ctx, [
    {
      label: `Yacona/KSB frequency > ${CLUSTER_B_MIN_YACONA_FREQ}`,
      passed: true,
      actual: f.yaconaFrequency,
    },
  ]);
};
