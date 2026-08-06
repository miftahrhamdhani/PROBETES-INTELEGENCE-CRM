"use server";

import { z } from "zod";
import { requireCrmPermission } from "@/server/auth/guards";
import { workspaceCostBodySchema, workspaceCostDecisionSchema, workspaceCostFilterSchema } from "@/lib/workspace-cost-contracts";
import {
  cancelWorkspaceCost,
  createWorkspaceCost,
  decideWorkspaceCost,
  getWorkspaceCost,
  getWorkspaceCostKpi,
  listWorkspaceCosts,
  submitWorkspaceCost,
  updateWorkspaceCostDraft,
} from "@/server/workspace/costs";

export async function loadWorkspaceCostsAction(input: unknown) {
  await requireCrmPermission("crm.com.read");
  return listWorkspaceCosts(workspaceCostFilterSchema.parse(input ?? {}));
}

export async function loadWorkspaceCostKpiAction(input: unknown) {
  await requireCrmPermission("crm.com.read");
  return getWorkspaceCostKpi(workspaceCostFilterSchema.parse(input ?? {}));
}

export async function loadWorkspaceCostAction(id: number) {
  await requireCrmPermission("crm.com.read");
  return getWorkspaceCost(z.coerce.number().int().positive().parse(id));
}

export async function createWorkspaceCostAction(input: unknown) {
  const user = await requireCrmPermission("crm.com.create");
  const body = workspaceCostBodySchema.parse(input);
  return createWorkspaceCost(body, Number(user.id), user.name);
}

export async function updateWorkspaceCostDraftAction(id: number, input: unknown) {
  const user = await requireCrmPermission("crm.com.update_own_draft");
  const body = workspaceCostBodySchema.parse(input);
  await updateWorkspaceCostDraft(z.coerce.number().int().positive().parse(id), body, Number(user.id));
}

export async function submitWorkspaceCostAction(id: number) {
  const user = await requireCrmPermission("crm.com.submit");
  await submitWorkspaceCost(z.coerce.number().int().positive().parse(id), Number(user.id));
}

async function decide(id: number, permission: Parameters<typeof requireCrmPermission>[0], decision: "approve" | "revision" | "reject", input: unknown) {
  const user = await requireCrmPermission(permission);
  const body = workspaceCostDecisionSchema.parse(input ?? {});
  await decideWorkspaceCost(z.coerce.number().int().positive().parse(id), Number(user.id), user.name, user.role === "ADMIN", decision, body.reason ?? null);
}

export async function leaderVerifyWorkspaceCostAction(id: number, input?: unknown) {
  await decide(id, "crm.com.leader_verify", "approve", input);
}
export async function spvApproveWorkspaceCostAction(id: number, input?: unknown) {
  await decide(id, "crm.com.spv_approve", "approve", input);
}
export async function directorApproveWorkspaceCostAction(id: number, input?: unknown) {
  await decide(id, "crm.com.director_approve", "approve", input);
}
export async function requestRevisionWorkspaceCostAction(id: number, input: unknown) {
  await decide(id, "crm.com.request_revision", "revision", input);
}
export async function rejectWorkspaceCostAction(id: number, input: unknown) {
  await decide(id, "crm.com.reject", "reject", input);
}

export async function cancelWorkspaceCostAction(id: number, input?: unknown) {
  const user = await requireCrmPermission("crm.com.cancel");
  const body = workspaceCostDecisionSchema.parse(input ?? {});
  await cancelWorkspaceCost(z.coerce.number().int().positive().parse(id), Number(user.id), user.role === "ADMIN", body.reason ?? null);
}
