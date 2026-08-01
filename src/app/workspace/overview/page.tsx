import { loadWorkspaceOverview } from "@/app/workspace-actions";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceOverviewKpiTiles } from "@/components/workspace/workspace-overview-kpi";
import { WorkspacePicSummaryTable } from "@/components/workspace/workspace-pic-summary";

export const dynamic = "force-dynamic";

/**
 * Workspace > Overview — pusat operasional harian CRM. Semua angka real-time
 * dari crm_tasks/customers (src/server/workspace/overview.ts), tidak ada mock.
 * Analytics (RFM/Cohort/Cluster) tetap di halaman masing-masing — halaman ini
 * murni status pekerjaan CRM.
 */
export default async function WorkspaceOverviewPage() {
  let overview;
  try {
    overview = await loadWorkspaceOverview();
  } catch {
    return (
      <AppShell title="Workspace Overview">
        <Card>
          <CardHeader>
            <CardTitle>Data belum tersedia</CardTitle>
            <CardDescription>Koneksi database gagal. Periksa server log.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Workspace Overview">
      <div className="space-y-4">
        <WorkspaceOverviewKpiTiles kpi={overview.kpi} />
        <WorkspacePicSummaryTable rows={overview.picSummary} />
      </div>
    </AppShell>
  );
}
