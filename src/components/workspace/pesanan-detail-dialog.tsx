"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Pencil } from "lucide-react";
import { loadWorkspacePesananDetailAction } from "@/app/workspace-pesanan-actions";
import { AuditLogList } from "@/components/workspace/audit-log-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { WorkspaceOrderDetail, WorkspaceOrderStatus } from "@/lib/workspace-pesanan-contracts";
import { formatDate, formatRupiah } from "@/lib/format";

const STATUS_VARIANT: Record<WorkspaceOrderStatus, "secondary" | "success" | "outline" | "warning"> = {
  DRAFT: "outline",
  CONFIRMED: "success",
  CANCELLED: "secondary",
  RETURNED: "warning",
  REFUNDED: "warning",
  PARTIALLY_REFUNDED: "warning",
};

/**
 * "Lihat Data" — MURNI menampilkan data (docs prompt fitur checkbox/klik-kanan
 * Pesanan: "lihat data ini juga sama tujuannya untuk menampilkan data"). Semua
 * aksi ubah status (Konfirmasi/Batal/Retur/Refund) dan Hapus dipindahkan ke
 * "Edit Data" (lihat pesanan-form.tsx, panel "Ubah Status Pesanan") — dialog
 * ini tidak lagi memanggil satu pun server action mutasi.
 */
export function PesananDetailDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [detail, setDetail] = React.useState<WorkspaceOrderDetail | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (id == null) {
      setDetail(null);
      return;
    }
    setLoading(true);
    loadWorkspacePesananDetailAction(id)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [id]);

  if (id == null) return null;

  return (
    <Dialog open={id != null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {detail?.orderNumber ?? "Detail Pesanan"}
            {detail ? <Badge variant={STATUS_VARIANT[detail.status]}>{detail.status}</Badge> : null}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {loading || !detail ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Memuat...</p>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                <Info label="Tanggal" value={formatDate(detail.orderDate)} />
                <Info label="No Order / ID Pesanan" value={detail.sourceOrderId ?? "—"} />
                <Info label="Nama Konsumen" value={detail.customerName} />
                <Info label="No HP" value={detail.phoneDisplay} />
                <Info label="Nama CRM" value={detail.crmNameSnapshot} />
                <Info label="Pembayaran" value={detail.paymentMethod} />
                <Info label="Ekspedisi/Hub" value={`${detail.expedition ?? "—"} / ${detail.hub ?? "—"}`} />
                <Info label="Sumber" value={detail.sourceType} />
                <Info label="Dibuat Oleh" value={detail.createdByName ?? "—"} />
              </div>

              <div className="rounded-md border">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Produk</th>
                      <th className="px-2 py-1.5 font-semibold">Jenis</th>
                      <th className="px-2 py-1.5 text-right font-semibold">QTY</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Harga</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Nilai</th>
                      <th className="px-2 py-1.5 text-right font-semibold">HPP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-2 py-1.5">{item.productNameSnapshot}</td>
                        <td className="px-2 py-1.5">{item.itemType}</td>
                        <td className="px-2 py-1.5 text-right tabular">{item.quantity}</td>
                        <td className="px-2 py-1.5 text-right tabular">{formatRupiah(item.sellingPriceSnapshot)}</td>
                        <td className="px-2 py-1.5 text-right tabular">{formatRupiah(item.totalSalesValue)}</td>
                        <td className="px-2 py-1.5 text-right tabular">{formatRupiah(item.totalHpp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-md border p-2.5 sm:grid-cols-4">
                <Summary label="Total Nilai Produk" value={detail.totalSalesValue} />
                <Summary label="Ongkir" value={detail.shippingCharge} />
                <Summary label="Packing" value={detail.packingCharge} />
                <Summary label="Admin COD" value={detail.codAdmin} />
                <Summary label="Diskon" value={detail.discount} negative />
                <Summary label="Voucher CRM" value={detail.crmVoucher} negative />
                <Summary label="TOTAL" value={detail.orderTotal} strong />
                <Summary label="COS Produk SALE" value={detail.cosSale} />
                <Summary label="COS Bonus/Sampel" value={detail.cosBonus} />
                <Summary label="Total COS" value={detail.totalCos} />
                <Summary label="Margin Sebelum COM" value={(BigInt(detail.orderTotal) - BigInt(detail.totalCos)).toString()} strong />
              </div>

              {(detail.status === "RETURNED" || detail.status === "REFUNDED" || detail.status === "PARTIALLY_REFUNDED") && (
                <div className="space-y-1 rounded-md border border-amber-300/60 bg-amber-50 p-2.5 text-[11px] dark:border-amber-800 dark:bg-amber-950">
                  {detail.returnedAt ? <p><span className="font-medium">Ditandai retur</span> {formatDate(detail.returnedAt)}{detail.returnReason ? ` — ${detail.returnReason}` : ""}</p> : null}
                  {detail.refundedAt ? (
                    <p>
                      <span className="font-medium">Ditandai refund</span> {formatDate(detail.refundedAt)}
                      {detail.refundAmount ? ` — ${formatRupiah(detail.refundAmount)}` : ""}
                      {detail.refundReason ? ` — ${detail.refundReason}` : ""}
                    </p>
                  ) : null}
                </div>
              )}

              <div className="flex justify-end border-t pt-2">
                <Button type="button" size="sm" asChild>
                  <Link href={`/workspace/pesanan/${detail.id}/edit`}><Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Edit Data</Link>
                </Button>
              </div>
              <AuditLogList entityType="WORKSPACE_ORDER" entityId={detail.id} />
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function Summary({ label, value, negative, strong }: { label: string; value: string; negative?: boolean; strong?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={strong ? "text-sm font-bold" : "font-medium"}>
        {negative && BigInt(value) > 0n ? "-" : ""}
        {formatRupiah(value)}
      </p>
    </div>
  );
}
