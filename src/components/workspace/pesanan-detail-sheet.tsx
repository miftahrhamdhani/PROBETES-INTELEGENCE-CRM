"use client";

import * as React from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CreditCard, Loader2, Package, SquareArrowOutUpRight, User, UserRound, X } from "lucide-react";
import { loadWorkspacePesananDetailAction } from "@/app/workspace-pesanan-actions";
import { AuditLogList } from "@/components/workspace/audit-log-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetBody, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type {
  WorkspaceItemType,
  WorkspaceOrderDetail,
  WorkspaceOrderStatus,
} from "@/lib/workspace-pesanan-contracts";
import { formatDate, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<WorkspaceOrderStatus, "secondary" | "success" | "outline" | "warning"> = {
  DRAFT: "outline",
  CONFIRMED: "success",
  CANCELLED: "secondary",
  RETURNED: "warning",
  REFUNDED: "warning",
  PARTIALLY_REFUNDED: "warning",
};

const ITEM_TYPE_TONE: Record<WorkspaceItemType, string> = {
  SALE: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
  BONUS: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300",
  SAMPLE: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
};

/** Nilai kosong tetap ditampilkan sebagai "-" (bukan disembunyikan) supaya
 *  pembaca tahu field-nya memang ada tapi belum diisi. */
const dash = (value: string | null | undefined) => (value?.trim() ? value : "-");

/**
 * Detail Pesanan sebagai panel kanan (bukan modal tengah) — daftar pesanan
 * tetap terlihat di sebelah kiri saat detail dibuka.
 *
 * MURNI TAMPILAN: seluruh angka datang apa adanya dari
 * `loadWorkspacePesananDetailAction` (action yang sudah ada). Tidak ada satu
 * pun perhitungan baru di sini — satu-satunya aritmetika, Margin Sebelum COM,
 * disalin persis dari dialog sebelumnya (orderTotal − totalCos).
 */
export function PesananDetailSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [detail, setDetail] = React.useState<WorkspaceOrderDetail | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (id == null) {
      setDetail(null);
      return;
    }
    let batal = false;
    setLoading(true);
    // Klik baris lain saat panel terbuka: hasil request lama diabaikan supaya
    // tidak menimpa detail yang baru diminta.
    loadWorkspacePesananDetailAction(id)
      .then((hasil) => {
        if (!batal) setDetail(hasil);
      })
      .finally(() => {
        if (!batal) setLoading(false);
      });
    return () => {
      batal = true;
    };
  }, [id]);

  return (
    /**
     * SENGAJA memakai DialogPrimitive langsung, BUKAN komponen <Sheet>.
     *
     * <SheetContent> selalu merender SheetOverlay ber-`bg-black/50`, sehingga
     * daftar pesanan di kiri ikut gelap saat detail dibuka — padahal desainnya
     * menuntut tabel tetap terbaca berdampingan dengan panel detail.
     *
     * Overlay itu TIDAK diubah di sheet.tsx karena dipakai bersama drawer
     * Customer, Task, dan navigasi mobile; mengubahnya akan mengubah halaman
     * lain di luar lingkup ini. Jadi panel ini memakai primitive-nya sendiri:
     * `modal={false}` + tanpa overlay gelap, dengan border + shadow sebagai
     * pemisah visual. Styling header/body tetap memakai SheetHeader/SheetBody
     * yang sama supaya konsisten dengan drawer lain.
     */
    <DialogPrimitive.Root modal={false} open={id != null} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          onInteractOutside={(event) => {
            // Klik di luar TIDAK menutup panel: klik baris lain di tabel harus
            // MENGGANTI isi detail, bukan menutupnya lalu membukanya lagi.
            // Penutupan tetap lewat tombol X atau Escape.
            event.preventDefault();
          }}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col gap-0 border-l bg-card",
            "shadow-[0_8px_40px_-12px_rgba(15,23,42,0.35)] outline-none sm:max-w-[34rem]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-300",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
          )}
        >
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Tutup</span>
          </DialogPrimitive.Close>
        <SheetHeader className="border-b">
          <div className="flex items-start justify-between gap-2 pr-12">
            <div className="min-w-0">
              <SheetTitle className="text-base">Detail Pesanan</SheetTitle>
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {detail?.sourceOrderId ?? detail?.orderNumber ?? "—"}
              </p>
            </div>
            {detail ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant={STATUS_VARIANT[detail.status]}>{detail.status}</Badge>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" asChild>
                  <Link href={`/workspace/pesanan/${detail.id}/edit`} aria-label="Buka halaman Edit Data">
                    <SquareArrowOutUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        </SheetHeader>

        <SheetBody className="space-y-5 text-xs">
          {loading || !detail ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Memuat...
            </p>
          ) : (
            <>
              <Section icon={User} title="Data Konsumen">
                <Row label="No Order / ID Pesanan Everpro" value={dash(detail.sourceOrderId)} mono />
                <Row label="Tanggal Pesanan" value={formatDate(detail.orderDate)} />
                <Row label="Nama Konsumen" value={detail.customerName} />
                <Row label="No HP" value={detail.phoneDisplay} mono />
                <Row label="Alamat Lengkap" value={dash(detail.address)} />
                <Row label="Kota/Kabupaten" value={dash(detail.city)} />
                <Row label="Kecamatan" value={dash(detail.district)} />
                <Row label="Kode Pos" value={dash(detail.postalCode)} />
              </Section>

              <Section icon={CreditCard} title="Pengiriman dan Pembayaran">
                <Row label="Ekspedisi" value={dash(detail.expedition)} />
                <Row label="Hub" value={dash(detail.hub)} />
                <Row label="Pembayaran" value={detail.paymentMethod} />
                <Row label="Memo" value={dash(detail.memo)} />
                <Row label="Mitra" value={dash(detail.partner)} />
              </Section>

              <Section icon={UserRound} title="Informasi Sales">
                <Row label="Nama CRM" value={detail.crmNameSnapshot} />
                <Row label="Type Sales" value={dash(detail.salesType)} />
                <Row label="Sumber Penjualan" value={dash(detail.salesSource)} />
              </Section>

              <Section icon={Package} title="Detail Produk">
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[22rem] text-left text-[11px]">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-2 py-1.5 font-semibold">Produk</th>
                        <th className="px-2 py-1.5 font-semibold">Jenis Item</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Qty</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Nilai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((item) => (
                        <tr key={item.id} className="border-t align-top">
                          <td className="px-2 py-1.5">{item.productNameSnapshot}</td>
                          <td className="px-2 py-1.5">
                            <Badge variant="outline" className={cn("whitespace-nowrap font-medium", ITEM_TYPE_TONE[item.itemType])}>
                              {item.itemType}
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular">{item.quantity}</td>
                          <td className="px-2 py-1.5 text-right tabular">{formatRupiah(item.totalSalesValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section icon={Package} title="Ringkasan Perhitungan">
                <div className="space-y-1">
                  <Money label="Total Nilai Produk" value={detail.totalSalesValue} />
                  <Money label="Ongkir" value={detail.shippingCharge} />
                  <Money label="Packing" value={detail.packingCharge} />
                  <Money label="Admin COD" value={detail.codAdmin} />
                  <Money label="Diskon" value={detail.discount} negative />
                  <Money label="Voucher CRM" value={detail.crmVoucher} negative />
                  <div className="my-1.5 border-t border-dashed" />
                  <Money label="TOTAL" value={detail.orderTotal} tone="total" />
                  <div className="my-1.5 border-t border-dashed" />
                  <Money label="COS Produk SALE" value={detail.cosSale} />
                  <Money label="COS Bonus/Sampel" value={detail.cosBonus} />
                  <Money label="Total COS" value={detail.totalCos} />
                  <div className="my-1.5 border-t border-dashed" />
                  {/* Ekspresi ini disalin apa adanya dari PesananDetailDialog
                      sebelumnya — bukan rumus baru. */}
                  <Money
                    label="Margin Sebelum COM"
                    value={(BigInt(detail.orderTotal) - BigInt(detail.totalCos)).toString()}
                    tone="margin"
                  />
                </div>
              </Section>

              {(detail.status === "RETURNED" || detail.status === "REFUNDED" || detail.status === "PARTIALLY_REFUNDED") && (
                <div className="space-y-1 rounded-md border border-amber-300/60 bg-amber-50 p-2.5 text-[11px] dark:border-amber-800 dark:bg-amber-950">
                  {detail.returnedAt ? (
                    <p>
                      <span className="font-medium">Ditandai retur</span> {formatDate(detail.returnedAt)}
                      {detail.returnReason ? ` — ${detail.returnReason}` : ""}
                    </p>
                  ) : null}
                  {detail.refundedAt ? (
                    <p>
                      <span className="font-medium">Ditandai refund</span> {formatDate(detail.refundedAt)}
                      {detail.refundAmount ? ` — ${formatRupiah(detail.refundAmount)}` : ""}
                      {detail.refundReason ? ` — ${detail.refundReason}` : ""}
                    </p>
                  ) : null}
                </div>
              )}

              <AuditLogList entityType="WORKSPACE_ORDER" entityId={detail.id} />
            </>
          )}
        </SheetBody>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof User;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

/** Baris "Label : Nilai" — label kiri, nilai kanan, seperti desain referensi. */
function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 break-words text-right font-medium", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function Money({
  label,
  value,
  negative,
  tone,
}: {
  label: string;
  value: string;
  negative?: boolean;
  tone?: "total" | "margin";
}) {
  const berkurang = negative && BigInt(value) > 0n;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-muted-foreground", tone && "font-semibold text-foreground")}>{label}</span>
      <span
        className={cn(
          "tabular",
          berkurang && "text-destructive",
          tone === "total" && "text-sm font-bold text-primary",
          tone === "margin" && "text-sm font-bold text-emerald-600 dark:text-emerald-400"
        )}
      >
        {berkurang ? "- " : ""}
        {formatRupiah(value)}
      </span>
    </div>
  );
}
