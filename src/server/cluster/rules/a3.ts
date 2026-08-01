/** Cluster A3 — priority 70. docs/02-CLUSTER-RULES.md §5. */
import { A1_MONETARY_THRESHOLD, type ClusterRuleFn } from "../types";
import { makeAssignment } from "./_helpers";

export const checkA3: ClusterRuleFn = (f, ctx) => {
  if (f.frequency !== 3) return null;
  if (f.monetary >= A1_MONETARY_THRESHOLD) return null;
  return makeAssignment("A3", ctx, [
    { label: "Frequency = 3", passed: true, actual: f.frequency },
    { label: "Monetary < Rp1.500.000", passed: true, actual: f.monetary.toString() },
  ]);
};
