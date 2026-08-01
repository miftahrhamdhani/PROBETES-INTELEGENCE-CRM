/** Cluster A4 — priority 80. docs/02-CLUSTER-RULES.md §5. */
import { A1_MONETARY_THRESHOLD, type ClusterRuleFn } from "../types";
import { makeAssignment } from "./_helpers";

export const checkA4: ClusterRuleFn = (f, ctx) => {
  if (f.frequency < 4) return null;
  if (f.monetary >= A1_MONETARY_THRESHOLD) return null;
  return makeAssignment("A4", ctx, [
    { label: "Frequency >= 4", passed: true, actual: f.frequency },
    { label: "Monetary < Rp1.500.000", passed: true, actual: f.monetary.toString() },
  ]);
};
