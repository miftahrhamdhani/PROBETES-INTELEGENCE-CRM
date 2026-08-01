import type { CrmReportListFilter } from "@/lib/crm-report-contracts";

/** Parsing query string yang sama dipakai halaman /crm-reports (client) dan
 *  route export (server) — supaya hasil export = hasil filter yang sedang dilihat. */
export function filterFromSearchParams(params: URLSearchParams): CrmReportListFilter {
  const pic = params.get("pic");
  return {
    search: params.get("search") ?? undefined,
    csName: params.get("csName") ?? undefined,
    platform: params.get("platform") ?? undefined,
    division: params.get("division") ?? undefined,
    salesType: params.get("salesType") ?? undefined,
    dateFrom: params.get("reportFrom") ?? undefined,
    dateTo: params.get("reportTo") ?? undefined,
    pic: pic ? Number(pic) : undefined,
    taskType: params.get("taskType") ?? undefined,
    taskStatus: params.get("taskStatus") ?? undefined,
    outcome: params.get("outcome") ?? undefined,
  };
}
