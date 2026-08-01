"use server";

import { requireRole } from "@/server/auth/guards";
import { listDataQualityIssues, listImportHistory } from "@/server/import/admin-queries";
import type { DataQualityFilter } from "@/lib/import-admin-types";

export async function loadImportHistory(page = 1) {
  await requireRole("ADMIN");
  return listImportHistory(page);
}

export async function loadDataQualityIssues(filter: DataQualityFilter) {
  await requireRole("ADMIN");
  return listDataQualityIssues(filter);
}
