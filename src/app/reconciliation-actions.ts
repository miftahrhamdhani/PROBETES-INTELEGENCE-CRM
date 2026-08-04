"use server";

import { requireRole } from "@/server/auth/guards";
import { getReconciliationReport } from "@/server/analytics/reconciliation";

/** Reconciliation = ADMIN & MANAGEMENT (src/lib/roles.ts /reconciliation).
 *  Isinya agregat/jumlah saja, tanpa PII per-customer. */
export async function loadReconciliationReport() {
  await requireRole("ADMIN", "MANAGEMENT");
  return getReconciliationReport();
}
