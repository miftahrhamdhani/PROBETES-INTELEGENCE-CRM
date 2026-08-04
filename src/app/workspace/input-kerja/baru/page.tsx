import { loadCrmReportList, loadReportPlatforms, loadReportProductNames } from "@/app/crm-reports-actions";
import { AppShell } from "@/components/layout/app-shell";
import { CrmReportWorkspaceForm } from "@/components/crm-report/crm-report-workspace-form";

export const dynamic = "force-dynamic";

/** Halaman penuh "Input Laporan CRM" (create) — pengganti dialog modal lama. */
export default async function InputLaporanBaruPage() {
  const [productNameOptions, platformOptions, initialList] = await Promise.all([
    loadReportProductNames(),
    loadReportPlatforms(),
    loadCrmReportList({ page: 1, perPage: 60 }),
  ]);

  return (
    <AppShell title="Input Laporan CRM">
      <CrmReportWorkspaceForm
        mode="create"
        productNameOptions={productNameOptions}
        platformOptions={platformOptions}
        initialList={initialList}
      />
    </AppShell>
  );
}
