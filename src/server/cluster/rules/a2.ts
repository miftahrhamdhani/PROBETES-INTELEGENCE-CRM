/** Cluster A2 — priority 60. docs/02-CLUSTER-RULES.md §5. */
import { A1_MONETARY_THRESHOLD, type ClusterRuleFn } from "../types";
import { makeAssignment } from "./_helpers";

export const checkA2: ClusterRuleFn = (f, ctx) => {
  if (f.frequency !== 2) return null;
  if (f.monetary >= A1_MONETARY_THRESHOLD) return null;
  return makeAssignment("A2", ctx, [
    { label: "Frequency = 2", passed: true, actual: f.frequency },
    { label: "Monetary < Rp1.500.000", passed: true, actual: f.monetary.toString() },
    { label: "Tidak match C-F2/D (dicek lebih dulu)", passed: true, actual: true },
  ]);
};
