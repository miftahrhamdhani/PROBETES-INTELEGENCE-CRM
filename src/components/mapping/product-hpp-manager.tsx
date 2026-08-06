"use client";

import * as React from "react";
import { createProductHppAction, loadProductHppHistoryAction } from "@/app/product-hpp-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CanonicalProductOption } from "@/lib/product-mapping-types";
import type { ProductHppRow } from "@/server/product/hpp";
import { formatRupiah } from "@/lib/format";

export function ProductHppManager({ products }: { products: CanonicalProductOption[] }) {
  const [productId, setProductId] = React.useState<number | "">("");
  const [history, setHistory] = React.useState<ProductHppRow[]>([]);
  const [unitHpp, setUnitHpp] = React.useState("");
  const [effectiveFrom, setEffectiveFrom] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function loadHistory(id: number) {
    startTransition(async () => setHistory(await loadProductHppHistoryAction(id)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>HPP Produk (bertanggal efektif)</CardTitle>
        <CardDescription>HPP baru menutup interval sebelumnya, tidak menimpa histori — margin transaksi lama tetap memakai snapshot HPP saat itu.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs">
            <span>Produk</span>
            <select
              className="h-9 w-56 rounded-md border bg-background px-2"
              value={productId}
              onChange={(event) => {
                const id = Number(event.target.value) || "";
                setProductId(id);
                if (id) loadHistory(id);
              }}
            >
              <option value="">Pilih produk…</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span>HPP per unit (Rp)</span>
            <input className="h-9 w-40 rounded-md border bg-background px-2" value={unitHpp} onChange={(event) => setUnitHpp(event.target.value)} inputMode="numeric" />
          </label>
          <label className="grid gap-1 text-xs">
            <span>Berlaku mulai</span>
            <input type="date" className="h-9 rounded-md border bg-background px-2" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
          </label>
          <Button
            size="sm"
            disabled={pending || !productId || !unitHpp || !effectiveFrom}
            onClick={() => startTransition(async () => {
              await createProductHppAction({ productId, unitHpp, effectiveFrom });
              setUnitHpp("");
              if (productId) loadHistory(Number(productId));
            })}
          >
            Simpan HPP
          </Button>
        </div>
        {history.length ? (
          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-xs">
              <thead className="bg-muted"><tr><th className="px-3 py-2 text-left">Berlaku dari</th><th className="px-3 py-2 text-left">Berlaku sampai</th><th className="px-3 py-2 text-left">HPP</th><th className="px-3 py-2 text-left">Dibuat oleh</th></tr></thead>
              <tbody>{history.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-2">{row.effectiveFrom}</td><td className="px-3 py-2">{row.effectiveTo ?? "Sekarang"}</td><td className="px-3 py-2">{formatRupiah(row.unitHpp)}</td><td className="px-3 py-2">{row.createdByName ?? "—"}</td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
