import { loadCrmReportDetail, loadReportPlatforms, loadReportProductNames } from "@/app/crm-reports-actions";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CrmReportWorkspaceForm } from "@/components/crm-report/crm-report-workspace-form";

export const dynamic = "force-dynamic";

/** Halaman penuh "Edit Laporan CRM" — pengganti dialog modal lama. */
export default async function EditLaporanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reportId = Number(id);

  if (!Number.isInteger(reportId) || reportId <= 0) {
    return (
      <AppShell title="Edit Laporan CRM">
        <Card>
          <CardHeader>
            <CardTitle>ID laporan tidak valid</CardTitle>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  let detail;
  let productNameOptions: string[] = [];
  let platformOptions: string[] = [];
  try {
    [detail, productNameOptions, platformOptions] = await Promise.all([
      loadCrmReportDetail(reportId),
      loadReportProductNames(),
      loadReportPlatforms(),
    ]);
  } catch {
    return (
      <AppShell title="Edit Laporan CRM">
        <Card>
          <CardHeader>
            <CardTitle>Data belum tersedia</CardTitle>
            <CardDescription>Koneksi database gagal. Periksa server log.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  if (!detail) {
    return (
      <AppShell title="Edit Laporan CRM">
        <Card>
          <CardHeader>
            <CardTitle>Laporan tidak ditemukan</CardTitle>
            <CardDescription>Laporan mungkin sudah dihapus atau ID tidak valid.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Edit Laporan CRM">
      <CrmReportWorkspaceForm
        mode="edit"
        reportId={reportId}
        initialData={detail}
        productNameOptions={productNameOptions}
        platformOptions={platformOptions}
      />
    </AppShell>
  );
}
