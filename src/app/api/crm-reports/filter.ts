import { crmReportListFilterSchema } from "@/lib/list-filter-contracts";
import type { CrmReportListFilter } from "@/lib/crm-report-contracts";

/** Parsing query string yang sama dipakai halaman /crm-reports (client) dan
 *  route export (server) — supaya hasil export = hasil filter yang sedang dilihat.
 *  Divalidasi Zod: query string datang dari luar, nilai tak dikenal dibuang. */
export function filterFromSearchParams(params: URLSearchParams): CrmReportListFilter {
  const raw = {
    search: params.get("search") ?? undefined,
    csName: params.get("csName") ?? undefined,
    platform: params.get("platform") ?? undefined,
    division: params.get("division") ?? undefined,
    salesType: params.get("salesType") ?? undefined,
    dateFrom: params.get("reportFrom") ?? undefined,
    dateTo: params.get("reportTo") ?? undefined,
    pic: params.get("pic") ?? undefined,
    taskType: params.get("taskType") ?? undefined,
    taskStatus: params.get("taskStatus") ?? undefined,
    outcome: params.get("outcome") ?? undefined,
  };
  return crmReportListFilterSchema.parse(
    Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""))
  );
}
