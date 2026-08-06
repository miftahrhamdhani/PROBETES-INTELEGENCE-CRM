import Link from "next/link";
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadReconciliationReport } from "@/app/reconciliation-actions";
import { ReconciliationCandidates } from "@/components/reconciliation/reconciliation-candidates";
import { UNIVERSE_LABELS } from "@/lib/reconciliation-types";

export const dynamic = "force-dynamic";

/**
 * Reconciliation (PRD §8) — menjelaskan selisih, bukan menebaknya.
 *
 * Setiap angka membawa label universe (baris / order / item / customer /
 * transaksi / membership) supaya satuan tidak pernah tercampur, dan tiap
 * bagian punya persamaan balance yang bisa dicek langsung.
 */
export default async function ReconciliationPage() {
  let report;
  try {
    report = await loadReconciliationReport();
  } catch (error) {
    console.error("Reconciliation gagal dimuat", error);
    return (
      <AppShell title="Reconciliation">
        <Card>
          <CardHeader>
            <CardTitle>Halaman belum bisa dimuat</CardTitle>
            <CardDescription>Koneksi database gagal. Periksa server log.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  const unbalanced = report.sections.filter((s) => s.balance && !s.balance.balanced);

  return (
    <AppShell title="Reconciliation">
      <div className="space-y-4">
        <ReconciliationCandidates />
        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Rekonsiliasi populasi &amp; transaksi</CardTitle>
              <CardDescription className="mt-1">{report.generatedFrom}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Data as of {formatDate(report.asOfDate)}</Badge>
              {unbalanced.length === 0 ? (
                <Badge variant="success">Semua balance</Badge>
              ) : (
                <Badge variant="warning">{unbalanced.length} bagian tidak balance</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Baca satuannya dulu.</strong> Angka di halaman ini punya universe
              berbeda — <em>baris file</em>, <em>order</em>, <em>item</em>, <em>customer</em>, <em>transaksi KSB</em>,
              dan <em>membership</em>. Selisih antar universe itu wajar dan bukan error; yang wajib balance hanya
              persamaan yang ditulis eksplisit di tiap bagian.
            </p>
          </CardContent>
        </Card>

        {report.sections.map((section) => (
          <Card key={section.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="scrollbar-thin overflow-x-auto rounded-lg border">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-muted/70">
                      <th className="border-b px-3 py-2 text-left font-semibold">Metrik</th>
                      <th className="border-b px-3 py-2 text-right font-semibold">Jumlah</th>
                      <th className="border-b px-3 py-2 text-left font-semibold">Satuan</th>
                      <th className="border-b px-3 py-2 text-left font-semibold">Asal angka</th>
                      <th className="border-b px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {section.metrics.map((metric) => (
                      <tr key={metric.key + metric.label} className="border-t">
                        <td className="px-3 py-2 font-medium">{metric.label}</td>
                        <td className="px-3 py-2 text-right tabular">{metric.value.toLocaleString("id-ID")}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="font-normal">{UNIVERSE_LABELS[metric.universe]}</Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{metric.note}</td>
                        <td className="px-3 py-2 text-right">
                          {metric.drilldownHref ? (
                            <Link
                              href={metric.drilldownHref}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              Lihat <ArrowRight className="h-3 w-3" />
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {section.balance ? (
                <div
                  className={`flex flex-wrap items-center gap-2 rounded-md border p-3 text-xs ${
                    section.balance.balanced
                      ? "border-green-500/40 bg-green-500/10"
                      : "border-destructive/40 bg-destructive/10"
                  }`}
                >
                  {section.balance.balanced ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span className="font-medium">{section.balance.expression}</span>
                  <span className="tabular text-muted-foreground">
                    → {section.balance.left.toLocaleString("id-ID")} vs {section.balance.right.toLocaleString("id-ID")}
                    {section.balance.balanced
                      ? " (cocok)"
                      : ` (selisih ${Math.abs(section.balance.left - section.balance.right).toLocaleString("id-ID")})`}
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`)
      )
    : "—";
}
