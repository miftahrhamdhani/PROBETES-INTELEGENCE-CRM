/** Cluster F — priority 100. Catch-all, selalu match. docs/02-CLUSTER-RULES.md §5. */
import type { ClusterRuleFn } from "../types";
import { makeAssignment } from "./_helpers";

export const checkF: ClusterRuleFn = (f, ctx) => {
  return makeAssignment("F", ctx, [
    { label: "Tidak match cluster lain (B, A1-A4, C, D, Dhp, E)", passed: true, actual: true },
  ]);
};
