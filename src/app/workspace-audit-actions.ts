"use server";

import { z } from "zod";
import { requireCrmPermission } from "@/server/auth/guards";
import { listEntityAuditLog } from "@/server/workspace/audit";

const inputSchema = z.object({
  entityType: z.enum(["WORKSPACE_ORDER", "WORKSPACE_PRODUCT", "WORKSPACE_PRODUCT_ALIAS", "WORKSPACE_COST"]),
  entityId: z.union([z.string(), z.number()]),
});

export async function loadEntityAuditLogAction(input: unknown) {
  await requireCrmPermission("crm.audit.read");
  const { entityType, entityId } = inputSchema.parse(input);
  return listEntityAuditLog(entityType, entityId);
}
