import { loadCrmReportList } from "@/app/crm-reports-actions";
import { CRM_REPORT_LIST_CHUNK } from "@/lib/list-chunk";
import { AppShell } from "@/components/layout/app-shell";
import { CrmReportManager } from "@/components/crm-report/crm-report-manager";
import { CrmReportSearchFilter } from "@/components/crm-report/crm-report-search-filter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CrmReportListFilter } from "@/lib/crm-report-contracts";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Workspace > Input Kerja — form laporan/closing CRM (template bisnis), terpisah
 * total dari transaksi kanonik Database All. Lihat CLAUDE.md untuk daftar field
 * & src/server/crm-report/service.ts untuk sumber query. Laporan yang sudah
 * diinput di sini bisa dilihat/dianalisis lebih lengkap di Workspace > Laporan Kerja.
 */
export default async function WorkspaceInputKerjaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const search = first(params.search);
  const reportFrom = first(params.reportFrom);
  const reportTo = first(params.reportTo);

  const filter: Omit<CrmReportListFilter, "page" | "perPage"> = {
    search,
    dateFrom: reportFrom,
    dateTo: reportTo,
  };

  let initialData;
  try {
    initialData = await loadCrmReportList({ ...filter, page: 1, perPage: CRM_REPORT_LIST_CHUNK });
  } catch {
    return (
      <AppShell title="Input Kerja">
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

  return (
    <AppShell title="Input Kerja">
      <div className="space-y-4">
        <CrmReportSearchFilter />

        <Card>
          <CardHeader>
            <CardTitle>{initialData.total.toLocaleString("id-ID")} laporan</CardTitle>
            <CardDescription>Klik baris untuk edit · scroll untuk memuat lebih banyak · kolom bisa di-resize</CardDescription>
          </CardHeader>
          <CardContent>
            <CrmReportManager filter={filter} initialData={initialData} exportQuery={exportQuery.toString()} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
