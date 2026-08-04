"use server";

import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import { listDataQualityIssues, listImportHistory } from "@/server/import/admin-queries";
import { pageNumberSchema } from "@/lib/list-filter-contracts";
import { IMPORT_ISSUE_CODES } from "@/lib/import-contracts";

/** Import History & Data Quality = ADMIN saja (src/lib/roles.ts). Detail issue
 *  memuat raw row import yang bisa berisi PII, jadi guard tidak boleh longgar. */
const dataQualityFilterSchema = z.object({
  batchId: z.coerce.number().int().positive().optional(),
  issueType: z.enum(IMPORT_ISSUE_CODES).optional(),
  page: pageNumberSchema.optional(),
  perPage: z.coerce.number().int().min(1).max(200).optional(),
});

export async function loadImportHistory(page: unknown = 1) {
  await requireRole("ADMIN");
  return listImportHistory(pageNumberSchema.parse(page ?? 1));
}

export async function loadDataQualityIssues(filter: unknown) {
  await requireRole("ADMIN");
  return listDataQualityIssues(dataQualityFilterSchema.parse(filter ?? {}));
}
