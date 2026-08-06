"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  ignoreUnmappedProductAction,
  loadUnmappedProductsAction,
  loadWorkspaceProductOptionsAction,
  resolveUnmappedProductAction,
  retryUnmappedProductAction,
} from "@/app/workspace-master-data-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

type UnmappedRow = Awaited<ReturnType<typeof loadUnmappedProductsAction>>[number];
type ProductOption = Awaited<ReturnType<typeof loadWorkspaceProductOptionsAction>>[number];

/**
 * Data Quality — produk tidak dikenal dari import Database All (docs prompt §K).
 * Resolusi membuat alias Master Data untuk nama mentah ini LALU langsung
 * me-replay order kanonik yang terdampak — tanpa import ulang file. Order yang
 * masih memuat produk tak dikenal lain sengaja tetap tertahan seluruhnya
 * (bukan sebagian) dan alasannya ditampilkan di toast.
 */
export function UnmappedProductsPanel({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [rows, setRows] = React.useState<UnmappedRow[]>([]);
  const [options, setOptions] = React.useState<ProductOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [picks, setPicks] = React.useState<Record<number, string>>({});
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [rawOpenId, setRawOpenId] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // PENDING + RESOLVED: baris RESOLVED tetap ditampilkan karena ordernya
      // bisa MASIH tertahan produk tak dikenal lain — di situlah tombol Retry
      // dipakai setelah produk penghalangnya ikut dipetakan.
      const [pending, resolved, productOptions] = await Promise.all([
        loadUnmappedProductsAction("PENDING"),
        loadUnmappedProductsAction("RESOLVED"),
        loadWorkspaceProductOptionsAction(),
      ]);
      setRows([...pending, ...resolved]);
      setOptions(productOptions);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const pendingCount = rows.filter((row) => row.status === "PENDING").length;

  const productChoices: ComboboxOption[] = options.map((option) => ({
    value: String(option.id),
    label: `${option.productId} — ${option.productName}`,
  }));

  /** Ringkas hasil replay jadi satu kalimat yang bisa dipercaya operator. */
  function describeRetry(result: Awaited<ReturnType<typeof resolveUnmappedProductAction>>): string {
    const parts: string[] = [];
    if (result.ordersIngested) parts.push(`${result.ordersIngested} pesanan masuk`);
    if (result.ordersConvertedFromManual) parts.push(`${result.ordersConvertedFromManual} pesanan manual jadi official`);
    if (result.ordersStillBlocked) {
      const blockers = result.blockingProductNames.slice(0, 3).join(", ");
      parts.push(`${result.ordersStillBlocked} masih tertahan produk lain${blockers ? ` (${blockers})` : ""}`);
    }
    if (result.ordersHeldAdjustedStatus) parts.push(`${result.ordersHeldAdjustedStatus} ditahan karena status ADJUSTED`);
    if (result.ordersSkippedNegativeTotal) parts.push(`${result.ordersSkippedNegativeTotal} dilewati karena TOTAL negatif`);
    if (!parts.length) return result.candidateOrders === 0 ? "tidak ada pesanan terdampak" : "tidak ada perubahan";
    return parts.join(" · ");
  }

  async function handleResolve(row: UnmappedRow) {
    const pick = picks[row.id];
    if (!pick) {
      toast.error("Pilih produk Master Data tujuan terlebih dahulu");
      return;
    }
    setBusyId(row.id);
    try {
      const result = await resolveUnmappedProductAction(row.id, Number(pick));
      toast.success(`"${row.rawProductName}" dipetakan — ${describeRetry(result)}`);
      await load();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan mapping");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetry(row: UnmappedRow) {
    setBusyId(row.id);
    try {
      const result = await retryUnmappedProductAction(row.id);
      toast.success(`Retry "${row.rawProductName}" — ${describeRetry(result)}`);
      await load();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menjalankan retry");
    } finally {
      setBusyId(null);
    }
  }

  async function handleIgnore(row: UnmappedRow) {
    setBusyId(row.id);
    try {
      await ignoreUnmappedProductAction(row.id, "Diabaikan manual dari Data Quality");
      toast.success(`"${row.rawProductName}" diabaikan`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengabaikan");
    } finally {
      setBusyId(null);
    }
  }

  if (!loading && rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          Produk Tidak Dikenal
          {pendingCount > 0 ? <Badge variant="warning">{pendingCount} pending</Badge> : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Order dengan produk ini TIDAK masuk KPI sampai dipetakan ke Master Data. Menyimpan alias langsung menjalankan retry order
          terdampak — tidak perlu import ulang Database All.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Memuat...</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="rounded-md border px-2.5 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[160px] flex-1">
                  <p className="flex items-center gap-1.5 font-medium">
                    {row.rawProductName}
                    {row.status === "RESOLVED" ? (
                      <Badge variant="success">Dipetakan → {row.mappedProductName ?? "—"}</Badge>
                    ) : null}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {row.occurrenceCount}× kejadian · contoh: {row.sampleCustomerName ?? "—"} · {row.sampleOrderDate ?? "—"}
                  </p>
                </div>
                {canManage ? (
                  row.status === "PENDING" ? (
                    <>
                      <Combobox
                        className="w-56"
                        options={productChoices}
                        value={picks[row.id] ?? null}
                        onChange={(value) => setPicks((p) => ({ ...p, [row.id]: value }))}
                        placeholder="Petakan ke produk..."
                      />
                      <Button type="button" size="sm" className="h-7 px-2" disabled={busyId === row.id} onClick={() => handleResolve(row)}>
                        {busyId === row.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : "Simpan Alias & Retry"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" disabled={busyId === row.id} onClick={() => handleIgnore(row)}>
                        Abaikan
                      </Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={busyId === row.id} onClick={() => handleRetry(row)}>
                      {busyId === row.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : "Retry"}
                    </Button>
                  )
                ) : (
                  <Badge variant="outline">Butuh admin/leader untuk memetakan</Badge>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-muted-foreground"
                  aria-expanded={rawOpenId === row.id}
                  onClick={() => setRawOpenId((current) => (current === row.id ? null : row.id))}
                >
                  Lihat Raw Data
                </Button>
              </div>
              {rawOpenId === row.id ? (
                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-2 text-[10px] leading-relaxed">
                  {JSON.stringify(
                    { sourceOrderId: row.sampleSourceOrderId, sampleCustomer: row.sampleCustomerName, sampleOrderDate: row.sampleOrderDate, rawPayload: row.rawPayload },
                    null,
                    2
                  )}
                </pre>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
