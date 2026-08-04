"use server";

import { crmReportSchema } from "@/lib/crm-report-contracts";
import { crmReportListFilterSchema, idSchema, pageNumberSchema } from "@/lib/list-filter-contracts";
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

/**
 * CRM Report memuat PII (nama, No. HP, alamat penerima) — setiap action di sini,
 * termasuk action BACA, wajib role guard sendiri. Middleware menyaring per-path
 * saja, sedangkan action id Next.js global (lihat catatan di customers-actions.ts).
 */
const requireReportAccess = () => requireRole("ADMIN", "CRM");

export async function loadCrmReportList(filter: unknown) {
  await requireReportAccess();
  return listReports(crmReportListFilterSchema.parse(filter));
}

/** Dipakai infinite scroll (useInfiniteRows) — sama pola dengan loadCustomerListPage. */
export async function loadCrmReportListPage(filter: unknown, page: unknown) {
  await requireReportAccess();
  const parsed = crmReportListFilterSchema.parse(filter);
  return listReports({ ...parsed, page: pageNumberSchema.parse(page), perPage: CRM_REPORT_LIST_CHUNK });
}

export async function loadCrmReportDetail(id: unknown) {
  await requireReportAccess();
  return getReport(idSchema.parse(id));
}

export async function createCrmReportAction(input: unknown): Promise<{ id: number }> {
  const user = await requireReportAccess();
  const body = crmReportSchema.parse(input);
  const id = await createReport(body, Number(user.id));
  return { id };
}

export async function updateCrmReportAction(id: unknown, input: unknown): Promise<void> {
  const user = await requireReportAccess();
  const reportId = idSchema.parse(id);
  const body = crmReportSchema.parse(input);
  await updateReport(reportId, body, Number(user.id));
}

export async function setCrmReportArchivedAction(id: unknown, archived: unknown): Promise<void> {
  const user = await requireReportAccess();
  await setReportArchived(idSchema.parse(id), Boolean(archived), Number(user.id));
}

export async function loadReportPlatforms() {
  await requireReportAccess();
  return listReportPlatforms();
}

export async function loadReportTotalValue(filter: unknown) {
  await requireReportAccess();
  return getReportTotalValue(crmReportListFilterSchema.parse(filter));
}

/** Autocomplete Nama Produk di form Input Laporan CRM — bukan katalog canonical. */
export async function loadReportProductNames() {
  await requireReportAccess();
  return listReportProductNames();
}
