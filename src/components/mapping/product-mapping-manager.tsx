"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Search } from "lucide-react";
import {
  approveProductMappingAction,
  loadUnknownProducts,
  previewMappingImpactAction,
} from "@/app/product-mapping-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  CanonicalProductOption,
  MappingImpactPreview,
  UnknownProductResult,
  UnknownProductRow,
} from "@/lib/product-mapping-types";

export function ProductMappingManager({
  initialData,
  products,
}: {
  initialData: UnknownProductResult;
  products: CanonicalProductOption[];
}) {
  const router = useRouter();
  const [data, setData] = React.useState(initialData);
  const [search, setSearch] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [target, setTarget] = React.useState<UnknownProductRow | null>(null);

  function runSearch(value: string) {
    startTransition(async () => {
      setData(await loadUnknownProducts({ search: value || undefined, page: 1 }));
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Nama produk belum dipetakan" value={formatInteger(data.total)} />
        <Stat label="Item order terdampak" value={formatInteger(data.totalUnknownItems)} />
        <Stat
          label="Customer NEEDS_REVIEW"
          value={formatInteger(data.totalNeedsReviewCustomers)}
          detail="Turun otomatis setelah mapping disetujui"
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Produk belum dipetakan</CardTitle>
            <CardDescription>
              Diurut dari yang paling sering muncul. Mapping tidak pernah ditebak otomatis — harus disetujui di sini.
            </CardDescription>
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              runSearch(search);
            }}
          >
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama produk…"
                className="h-9 w-56 pl-8"
                aria-label="Cari nama produk"
              />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={pending}>Cari</Button>
          </form>
        </CardHeader>
        <CardContent>
          {pending ? (
            <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
          ) : data.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {search ? "Tidak ada produk yang cocok." : "Semua produk sudah dipetakan. Tidak ada UNKNOWN tersisa."}
            </p>
          ) : (
            <div className="scrollbar-thin overflow-x-auto rounded-lg border">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/70">
                    <Th>Nama produk (mentah)</Th>
                    <Th numeric>Item</Th>
                    <Th numeric>Customer</Th>
                    <Th numeric>Needs review</Th>
                    <Th numeric>Nilai</Th>
                    <Th>Periode</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.rawProductName} className="border-t">
                      <td className="px-3 py-2">
                        <p className="font-medium">{row.rawProductName}</p>
                        <p className="text-[11px] text-muted-foreground">canonical: {row.normalizedName}</p>
                      </td>
                      <Td numeric>{formatInteger(row.itemCount)}</Td>
                      <Td numeric>{formatInteger(row.customerCount)}</Td>
                      <Td numeric>
                        {row.needsReviewCount > 0 ? (
                          <Badge variant="warning">{formatInteger(row.needsReviewCount)}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </Td>
                      <Td numeric>{formatRupiah(row.totalAmount)}</Td>
                      <Td>{row.firstSeen ?? "—"} … {row.lastSeen ?? "—"}</Td>
                      <Td>
                        <Button size="sm" variant="outline" onClick={() => setTarget(row)}>Petakan</Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {target ? (
        <MappingDialog
          row={target}
          products={products}
          onClose={() => setTarget(null)}
          onApproved={() => {
            setTarget(null);
            startTransition(async () => {
              setData(await loadUnknownProducts({ search: search || undefined, page: 1 }));
              router.refresh();
            });
          }}
        />
      ) : null}
    </div>
  );
}

function MappingDialog({
  row,
  products,
  onClose,
  onApproved,
}: {
  row: UnknownProductRow;
  products: CanonicalProductOption[];
  onClose: () => void;
  onApproved: () => void;
}) {
  const [productId, setProductId] = React.useState<number | null>(null);
  const [preview, setPreview] = React.useState<MappingImpactPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function choose(id: number) {
    setProductId(id);
    setPreview(null);
    setError(null);
    setLoadingPreview(true);
    try {
      setPreview(await previewMappingImpactAction({ rawProductName: row.rawProductName, productId: id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat dampak");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function approve() {
    if (!productId) return;
    setSaving(true);
    setError(null);
    try {
      await approveProductMappingAction({ rawProductName: row.rawProductName, productId });
      onApproved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan mapping");
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Petakan &ldquo;{row.rawProductName}&rdquo;</DialogTitle>
          <DialogDescription>
            Pilih produk canonical tujuan. Dampaknya ditampilkan dulu sebelum disimpan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium" htmlFor="target-product">Produk canonical</label>
            <select
              id="target-product"
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={productId ?? ""}
              onChange={(event) => choose(Number(event.target.value))}
            >
              <option value="" disabled>Pilih produk…</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name} · {product.code}</option>
              ))}
            </select>
          </div>

          {loadingPreview ? (
            <div className="flex items-center gap-2 rounded-md border p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menghitung dampak…
            </div>
          ) : preview ? (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
              <p className="font-medium">Dampak bila disetujui</p>
              <ImpactRow label="Item order di-remap" value={formatInteger(preview.itemCount)} />
              <ImpactRow label="Customer dihitung ulang" value={formatInteger(preview.customerCount)} />
              <ImpactRow label="Kini NEEDS_REVIEW" value={formatInteger(preview.needsReviewBefore)} />
              <ImpactRow
                label="Tidak lagi punya produk UNKNOWN"
                value={formatInteger(preview.customersFullyResolved)}
                highlight
              />
              <p className="pt-1 text-[11px] text-muted-foreground">
                Cluster hanya dihitung ulang untuk customer terdampak. Aturan A1–F tidak berubah.
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={approve} disabled={!productId || saving || loadingPreview}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyimpan…</> : <><Check className="h-3.5 w-3.5" /> Setujui mapping</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImpactRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-semibold text-green-700 dark:text-green-400" : "font-medium"}>{value}</span>
    </div>
  );
}
function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </CardContent></Card>
  );
}
function Th({ children, numeric = false }: { children?: React.ReactNode; numeric?: boolean }) {
  return <th className={`border-b px-3 py-2 font-semibold ${numeric ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, numeric = false }: { children?: React.ReactNode; numeric?: boolean }) {
  return <td className={`px-3 py-2 ${numeric ? "text-right tabular" : ""}`}>{children}</td>;
}
function formatInteger(value: number) { return value.toLocaleString("id-ID"); }
function formatRupiah(value: string) { return `Rp ${BigInt(value).toLocaleString("id-ID")}`; }
