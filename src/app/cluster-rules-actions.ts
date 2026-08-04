"use server";

import { requireRole } from "@/server/auth/guards";
import { getClusterAssignmentCounts } from "@/server/cluster/reference";
import {
  CLUSTER_RULE_METADATA,
  CLUSTER_RULE_SPECS,
  NON_CLUSTER_SPECS,
} from "@/lib/cluster-rule-spec";

/**
 * Cluster Rules = ADMIN & MANAGEMENT (src/lib/roles.ts /rules).
 * Read-only: tidak ada action tulis di file ini, memang disengaja — aturan
 * A1–F IMMUTABLE (CLAUDE.md aturan mutlak #1).
 */
export async function loadClusterRuleReference() {
  await requireRole("ADMIN", "MANAGEMENT");
  const distribution = await getClusterAssignmentCounts();
  const totalAssigned = CLUSTER_RULE_SPECS.reduce(
    (sum, spec) => sum + (distribution[spec.code] ?? 0),
    0
  );
  return {
    metadata: CLUSTER_RULE_METADATA,
    specs: CLUSTER_RULE_SPECS,
    nonClusterSpecs: NON_CLUSTER_SPECS,
    distribution,
    totalAssigned,
  };
}
