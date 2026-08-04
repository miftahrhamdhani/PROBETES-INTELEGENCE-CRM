import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadClusterRuleReference } from "@/app/cluster-rules-actions";
import { CLUSTER_LABELS, NON_CLUSTER_LABELS } from "@/lib/cluster-codes";

export const dynamic = "force-dynamic";

/**
 * Cluster Rules — READ-ONLY untuk V1 (ADMIN & MANAGEMENT).
 *
 * Sengaja tidak ada tombol edit: aturan A1–F adalah aturan perusahaan yang
 * IMMUTABLE (CLAUDE.md aturan mutlak #1). Angka ambang di halaman ini dibaca
 * dari src/lib/cluster-rule-spec.ts — konstanta yang sama yang dipakai engine,
 * bukan salinan terpisah, sehingga tidak mungkin menyimpang.
 */
export default async function ClusterRulesPage() {
  let reference;
  try {
    reference = await loadClusterRuleReference();
  } catch (error) {
    console.error("Cluster Rules gagal dimuat", error);
    return (
      <AppShell title="Cluster Rules">
        <Card>
          <CardHeader>
            <CardTitle>Halaman belum bisa dimuat</CardTitle>
            <CardDescription>Koneksi database gagal. Periksa server log.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  const { metadata, specs, nonClusterSpecs, distribution, totalAssigned } = reference;

  return (
    <AppShell title="Cluster Rules">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Aturan Cluster Probetes</CardTitle>
              <CardDescription className="mt-1">{metadata.evaluation}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Versi {metadata.version}</Badge>
              <Badge variant="outline">Berlaku sejak {metadata.effectiveFrom}</Badge>
              <Badge variant="secondary">Read-only</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <strong>Aturan ini tidak dapat diubah dari aplikasi.</strong> A1–F adalah aturan perusahaan.
              Perubahan hanya lewat persetujuan pemilik proses bisnis dan dokumen{" "}
              <code className="rounded bg-muted px-1">{metadata.document}</code>. Angka ambang di halaman ini
              dibaca dari konstanta yang sama dengan yang dipakai rule engine.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Urutan prioritas evaluasi</CardTitle>
            <CardDescription>Dievaluasi dari atas ke bawah, berhenti di kecocokan pertama.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="scrollbar-thin overflow-x-auto rounded-lg border">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/70">
                    <th className="border-b px-3 py-2 text-right font-semibold">Prio</th>
                    <th className="border-b px-3 py-2 text-left font-semibold">Cluster</th>
                    <th className="border-b px-3 py-2 text-left font-semibold">Ringkasan</th>
                    <th className="border-b px-3 py-2 text-right font-semibold">Customer</th>
                  </tr>
                </thead>
                <tbody>
                  {specs.map((spec) => (
                    <tr key={spec.code} className="border-t">
                      <td className="px-3 py-2 text-right tabular text-muted-foreground">{spec.priority}</td>
                      <td className="px-3 py-2">
                        <Link href={`/cluster?cluster=${spec.code}`} className="font-semibold hover:underline">
                          {spec.label}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{spec.summary}</td>
                      <td className="px-3 py-2 text-right tabular">
                        {formatInteger(distribution[spec.code] ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/40 font-medium">
                    <td className="px-3 py-2" colSpan={3}>Total customer ber-cluster resmi</td>
                    <td className="px-3 py-2 text-right tabular">{formatInteger(totalAssigned)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-3 lg:grid-cols-2">
          {specs.map((spec) => (
            <Card key={spec.code}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{spec.label}</CardTitle>
                  <Badge variant="outline">priority {spec.priority}</Badge>
                </div>
                <CardDescription>{spec.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div>
                  <p className="font-semibold">Syarat</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                    {spec.conditions.map((condition) => <li key={condition}>{condition}</li>)}
                  </ul>
                </div>
                {spec.exclusions.length ? (
                  <div>
                    <p className="font-semibold">Catatan &amp; pengecualian</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                      {spec.exclusions.map((exclusion) => <li key={exclusion}>{exclusion}</li>)}
                    </ul>
                  </div>
                ) : null}
                <p className="border-t pt-2 text-[11px] text-muted-foreground">
                  Implementasi: <code className="rounded bg-muted px-1">{spec.source}</code>
                </p>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Status yang BUKAN cluster</CardTitle>
            <CardDescription>
              Tidak pernah dihitung sebagai bagian dari 14 cluster resmi, dan tidak pernah dibuang ke Cluster F.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {nonClusterSpecs.map((spec) => (
              <div key={spec.code} className="rounded-md border p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{NON_CLUSTER_LABELS[spec.code]}</p>
                  <span className="tabular text-muted-foreground">{formatInteger(distribution[spec.code] ?? 0)}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{spec.summary}</p>
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {spec.conditions.map((condition) => <li key={condition}>{condition}</li>)}
                </ul>
                <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">{spec.resolution}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function formatInteger(value: number) {
  return value.toLocaleString("id-ID");
}

// Dipakai agar TS memastikan seluruh cluster punya label (gagal build kalau ada yang lupa).
void CLUSTER_LABELS;
