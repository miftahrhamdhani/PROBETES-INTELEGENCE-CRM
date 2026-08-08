"use server";

import { z } from "zod";
import { requireCrmPermission } from "@/server/auth/guards";
import { getWorkspaceOverview } from "@/server/workspace/pesanan-overview";

const dateFilterSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function loadWorkspaceOverviewAction(input: unknown) {
  await requireCrmPermission("crm.workspace.overview.read");
  const filter = dateFilterSchema.parse(input ?? {});
  return getWorkspaceOverview(filter);
}
