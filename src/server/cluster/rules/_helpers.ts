import { CLUSTER_CODES, type ClusterAssignmentCode, type ClusterCode } from "@/lib/cluster-codes";
import { priorityOf, type ClusterAssignment, type ClusterCheck, type ClusterContext } from "../types";

function isClusterCode(code: ClusterAssignmentCode): code is ClusterCode {
  return (CLUSTER_CODES as readonly string[]).includes(code);
}

export function makeAssignment(
  code: ClusterAssignmentCode,
  ctx: ClusterContext,
  checks: ClusterCheck[]
): ClusterAssignment {
  return {
    clusterCode: code,
    ruleVersion: ctx.ruleVersion,
    asOfDate: ctx.asOfDate,
    reason: {
      matchedRule: code,
      priority: isClusterCode(code) ? priorityOf(code) : null,
      checks,
    },
  };
}
