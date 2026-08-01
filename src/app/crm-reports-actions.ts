"use server";

import { crmReportSchema, type CrmReportListFilter } from "@/lib/crm-report-contracts";
import { CRM_REPORT_LIST_CHUNK } from "@/lib/list-chunk";
import { requireRole } from "@/server/auth/guards";
import {
  createReport,
  getReport,
  getReportTotalValue,
  listReportPlatforms,
  listReportProductNames,
  listReports,
  setReportArchived,
  updateReport,
} from "@/server/crm-report/service";

export async function loadCrmReportList(filter: CrmReportListFilter) {
  return listReports(filter);
}

/** Dipakai infinite scroll (useInfiniteRows) — sama pola dengan loadCustomerListPage. */
export async function loadCrmReportListPage(filter: Omit<CrmReportListFilter, "page" | "perPage">, page: number) {
  return listReports({ ...filter, page, perPage: CRM_REPORT_LIST_CHUNK });
}

export async function loadCrmReportDetail(id: number) {
  return getReport(id);
}

export async function createCrmReportAction(input: unknown): Promise<{ id: number }> {
  const user = await requireRole("ADMIN", "CRM");
  const body = crmReportSchema.parse(input);
  const id = await createReport(body, Number(user.id));
  return { id };
}

export async function updateCrmReportAction(id: number, input: unknown): Promise<void> {
  const user = await requireRole("ADMIN", "CRM");
  const body = crmReportSchema.parse(input);
  await updateReport(id, body, Number(user.id));
}

export async function setCrmReportArchivedAction(id: number, archived: boolean): Promise<void> {
  const user = await requireRole("ADMIN", "CRM");
  await setReportArchived(id, archived, Number(user.id));
}

export async function loadReportPlatforms() {
  await requireRole("ADMIN", "CRM");
  return listReportPlatforms();
}

export async function loadReportTotalValue(filter: CrmReportListFilter) {
  await requireRole("ADMIN", "CRM");
  return getReportTotalValue(filter);
}

/** Autocomplete Nama Produk di form Input Laporan CRM — bukan katalog canonical. */
export async function loadReportProductNames() {
  await requireRole("ADMIN", "CRM");
  return listReportProductNames();
}
