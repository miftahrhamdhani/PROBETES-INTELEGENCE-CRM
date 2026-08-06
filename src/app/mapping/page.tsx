import { AppShell } from "@/components/layout/app-shell";
import { ProductMappingManager } from "@/components/mapping/product-mapping-manager";
import { ProductHppManager } from "@/components/mapping/product-hpp-manager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  loadApprovedAliases,
  loadCanonicalProducts,
  loadUnknownProducts,
} from "@/app/product-mapping-actions";

export const dynamic = "force-dynamic";

/**
 * Product Mapping (FR-25) — ADMIN. Approval di sini bukan sekadar catatan:
 * item canonical yang sudah terlanjur UNKNOWN ikut di-remap dan cluster
 * customer terdampak dihitung ulang. Lihat src/server/product/service.ts.
 */
export default async function ProductMappingPage() {
  let unknown, products, aliases;
  try {
    [unknown, products, aliases] = await Promise.all([
      loadUnknownProducts({ page: 1 }),
      loadCanonicalProducts(),
      loadApprovedAliases(),
    ]);
  } catch (error) {
    console.error("Product Mapping gagal dimuat", error);
    return (
      <AppShell title="Product Mapping">
        <Card>
          <CardHeader>
            <CardTitle>Halaman belum bisa dimuat</CardTitle>
            <CardDescription>Koneksi database gagal atau produk canonical belum di-seed. Periksa server log.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Product Mapping">
      <div className="space-y-4">
        <ProductMappingManager initialData={unknown} products={products} />
        <ProductHppManager products={products} />

        <Card>
          <CardHeader>
            <CardTitle>Mapping yang sudah disetujui</CardTitle>
            <CardDescription>
              Dipakai otomatis oleh import berikutnya, jadi produk yang sama tidak jatuh ke UNKNOWN lagi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aliases.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                Belum ada mapping yang disetujui lewat halaman ini.
              </p>
            ) : (
              <div className="scrollbar-thin max-h-96 overflow-auto rounded-lg border">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="sticky top-0 bg-muted/90">
                    <tr>
                      <th className="border-b px-3 py-2 text-left font-semibold">Nama mentah</th>
                      <th className="border-b px-3 py-2 text-left font-semibold">Produk canonical</th>
                      <th className="border-b px-3 py-2 text-left font-semibold">Disetujui</th>
                      <th className="border-b px-3 py-2 text-left font-semibold">Oleh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aliases.map((alias) => (
                      <tr key={alias.id} className="border-t">
                        <td className="px-3 py-2">{alias.rawName}</td>
                        <td className="px-3 py-2">{alias.productName} <span className="text-muted-foreground">· {alias.productCode}</span></td>
                        <td className="px-3 py-2 tabular">{alias.approvedAt?.slice(0, 19).replace("T", " ") ?? "—"}</td>
                        <td className="px-3 py-2">{alias.approvedBy ?? "seed awal"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cara kerja</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
            <p><strong className="text-foreground">Tidak ada tebakan otomatis.</strong> Nama produk baru yang tidak dikenal tetap UNKNOWN sampai admin menyetujuinya di sini (CLAUDE.md #10).</p>
            <p><strong className="text-foreground">Dampak ditampilkan dulu.</strong> Jumlah item, customer, dan berapa yang keluar dari NEEDS_REVIEW dihitung sebelum disimpan.</p>
            <p><strong className="text-foreground">Rekalkulasi terbatas.</strong> Hanya customer terdampak yang cluster-nya dihitung ulang, dengan engine aturan yang sama persis — aturan A1–F tidak berubah.</p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
