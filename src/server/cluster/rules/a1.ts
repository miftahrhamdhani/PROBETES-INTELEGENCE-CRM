/** Cluster A1 — priority 20. docs/02-CLUSTER-RULES.md §5. */
import { A1_MONETARY_THRESHOLD, type ClusterRuleFn } from "../types";
import { makeAssignment } from "./_helpers";

export const checkA1: ClusterRuleFn = (f, ctx) => {
  if (f.frequency < 2) return null;
  if (f.monetary < A1_MONETARY_THRESHOLD) return null;
  return makeAssignment("A1", ctx, [
    { label: "Frequency >= 2", passed: true, actual: f.frequency },
    { label: "Monetary >= Rp1.500.000", passed: true, actual: f.monetary.toString() },
    { label: "Bukan Cluster B", passed: true, actual: f.yaconaFrequency },
  ]);
};
