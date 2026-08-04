import { loadCrmReportList, loadReportPlatforms, loadReportTotalValue } from "@/app/crm-reports-actions";
import { loadAssignableCrmUsers, loadWorkspaceOverview } from "@/app/workspace-actions";
import { CRM_REPORT_LIST_CHUNK } from "@/lib/list-chunk";
import { AppShell } from "@/components/layout/app-shell";
import { CrmReportManager } from "@/components/crm-report/crm-report-manager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceReportFilter } from "@/components/workspace/workspace-report-filter";
import { WorkspaceReportKpiTiles } from "@/components/workspace/workspace-report-kpi";
import type { CrmReportListFilter } from "@/lib/crm-report-contracts";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Workspace > Laporan Kerja — dashboard pelaporan: KPI status pekerjaan CRM
 * (dari crm_tasks) + daftar laporan CRM lengkap dengan CRUD/export (crm_reports,
 * sama data dengan Input Kerja, ditambah kolom Jenis Tugas/Status/Outcome/PIC
 * untuk laporan yang tertaut ke task). CRM report tetap BUKAN canonical order.
 */
export default async function WorkspaceLaporanKerjaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const search = first(params.search);
  const reportFrom = first(params.reportFrom);
  const reportTo = first(params.reportTo);
  const pic = first(params.pic);
  const taskType = first(params.taskType);
  const taskStatus = first(params.taskStatus);
  const outcome = first(params.outcome);
  const platform = first(params.platform);

  const filter: Omit<CrmReportListFilter, "page" | "perPage"> = {
    search,
    dateFrom: reportFrom,
    dateTo: reportTo,
    pic: pic ? Number(pic) : undefined,
    taskType,
    taskStatus,
    outcome,
    platform,
  };

  let initialData;
  let picOptions;
  let platformOptions;
  let overview;
  let reportTotalValue;
  try {
    [initialData, picOptions, platformOptions, overview, reportTotalValue] = await Promise.all([
      loadCrmReportList({ ...filter, page: 1, perPage: CRM_REPORT_LIST_CHUNK }),
      loadAssignableCrmUsers(),
      loadReportPlatforms(),
      loadWorkspaceOverview(),
      loadReportTotalValue(filter),
    ]);
  } catch {
    return (
      <AppShell title="Laporan Kerja">
        <Card>
          <CardHeader>
            <CardTitle>Data belum tersedia</CardTitle>
            <CardDescription>Koneksi database gagal. Periksa server log.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  const exportQuery = new URLSearchParams();
  if (search) exportQuery.set("search", search);
  if (reportFrom) exportQuery.set("reportFrom", reportFrom);
  if (reportTo) exportQuery.set("reportTo", reportTo);
  if (pic) exportQuery.set("pic", pic);
  if (taskType) exportQuery.set("taskType", taskType);
  if (taskStatus) exportQuery.set("taskStatus", taskStatus);
  if (outcome) exportQuery.set("outcome", outcome);
  if (platform) exportQuery.set("platform", platform);

  return (
    <AppShell title="Laporan Kerja">
      <div className="space-y-4">
        <WorkspaceReportKpiTiles kpi={overview.kpi} reportTotalValue={reportTotalValue} />
        <Card>
          <CardHeader>
            <CardTitle>{initialData.total.toLocaleString("id-ID")} laporan</CardTitle>
            <CardDescription>Klik baris untuk edit · scroll untuk memuat lebih banyak · kolom bisa di-resize</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <WorkspaceReportFilter picOptions={picOptions} platformOptions={platformOptions} />
            <CrmReportManager filter={filter} initialData={initialData} exportQuery={exportQuery.toString()} showTaskColumns />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
