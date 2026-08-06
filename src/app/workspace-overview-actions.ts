"use server";

import { z } from "zod";
import { requireCrmPermission } from "@/server/auth/guards";
import {
  getCustomerSummary,
  getOverviewKpi,
  getPaymentComposition,
  getPesananTrend,
  getTopProductsByCos,
  getTopProductsByQuantity,
  getTopProductsByRevenue,
} from "@/server/workspace/pesanan-overview";

const dateFilterSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function loadWorkspaceOverviewAction(input: unknown) {
  await requireCrmPermission("crm.workspace.overview.read");
  const filter = dateFilterSchema.parse(input ?? {});
  const [kpi, trend, productsByQuantity, productsByRevenue, productsByCos, paymentComposition, customerSummary] = await Promise.all([
    getOverviewKpi(filter),
    getPesananTrend(filter),
    getTopProductsByQuantity(filter),
    getTopProductsByRevenue(filter),
    getTopProductsByCos(filter),
    getPaymentComposition(filter),
    getCustomerSummary(filter),
  ]);
  return { kpi, trend, productsByQuantity, productsByRevenue, productsByCos, paymentComposition, customerSummary };
}
