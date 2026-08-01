import { loadReportPlatforms, loadReportProductNames } from "@/app/crm-reports-actions";
import { AppShell } from "@/components/layout/app-shell";
import { CrmReportWorkspaceForm } from "@/components/crm-report/crm-report-workspace-form";

export const dynamic = "force-dynamic";

/** Halaman penuh "Input Laporan CRM" (create) — pengganti dialog modal lama. */
export default async function InputLaporanBaruPage() {
  const [productNameOptions, platformOptions] = await Promise.all([loadReportProductNames(), loadReportPlatforms()]);

  return (
    <AppShell title="Input Laporan CRM">
      <CrmReportWorkspaceForm mode="create" productNameOptions={productNameOptions} platformOptions={platformOptions} />
    </AppShell>
  );
}
