"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarIcon, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  cancelWorkspacePesananAction,
  confirmWorkspacePesananAction,
  createWorkspacePesananAction,
  deleteWorkspacePesananAction,
  markWorkspacePesananRefundedAction,
  markWorkspacePesananReturnedAction,
  updateWorkspacePesananAction,
} from "@/app/workspace-pesanan-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_VARIANT } from "@/components/workspace/pesanan-columns";
import {
  availableStatusTargets,
  EXPEDITION_OPTIONS,
  HUB_OPTIONS,
  SALES_SOURCE_OPTIONS,
  SALES_TYPE_OPTIONS,
  type WorkspaceItemType,
  type WorkspaceOrderDetail,
  type WorkspaceOrderStatusChangeTarget,
} from "@/lib/workspace-pesanan-contracts";
import { allowedItemTypesForUsage, type WorkspaceProductUsage } from "@/lib/workspace-product-seed";
import type { WorkspaceProductOption } from "@/lib/workspace-master-data-contracts";
import { formatRupiah } from "@/lib/format";
import { todayInJakarta } from "@/lib/workspace-date-presets";

const STATUS_TARGET_LABELS: Record<WorkspaceOrderStatusChangeTarget, string> = {
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancel",
  RETURNED: "Retur",
  REFUNDED: "Refund",
};

type ItemRow = {
  key: string;
  rowKind: "SALE" | "BONUS_SAMPLE";
  productInternalId: number | null;
  itemType: WorkspaceItemType;
  quantity: string;
};

let rowSeq = 0;
function newRow(rowKind: ItemRow["rowKind"]): ItemRow {
  rowSeq += 1;
  return { key: `row-${rowSeq}`, rowKind, productInternalId: null, itemType: rowKind === "SALE" ? "SALE" : "BONUS", quantity: "1" };
}

type FormState = {
  orderDate: string;
  sourceOrderId: string;
  customerName: string;
  phone: string;
  address: string;
  city: string;
  district: string;
  postalCode: string;
  expedition: string;
  hub: string;
  paymentMethod: "COD" | "TRANSFER";
  memo: string;
  partner: string;
  crmUserId: string;
  salesType: string;
  salesSource: string;
  items: ItemRow[];
  shippingCharge: string;
  packingCharge: string;
  discount: string;
  codAdmin: string;
  crmVoucher: string;
};

function emptyForm(defaultCrmUserId: string): FormState {
  return {
    orderDate: todayInJakarta(),
    sourceOrderId: "",
    customerName: "",
    phone: "",
    address: "",
    city: "",
    district: "",
    postalCode: "",
    expedition: "",
    hub: "",
    paymentMethod: "TRANSFER",
    memo: "",
    partner: "",
    crmUserId: defaultCrmUserId,
    salesType: "",
    salesSource: "",
    items: [newRow("SALE")],
    shippingCharge: "0",
    packingCharge: "0",
    discount: "0",
    codAdmin: "0",
    crmVoucher: "0",
  };
}

function formFromDetail(detail: WorkspaceOrderDetail): FormState {
  return {
    orderDate: detail.orderDate,
    sourceOrderId: detail.sourceOrderId ?? "",
    customerName: detail.customerName,
    phone: detail.phoneDisplay,
    address: detail.address ?? "",
    city: detail.city ?? "",
    district: detail.district ?? "",
    postalCode: detail.postalCode ?? "",
    expedition: detail.expedition ?? "",
    hub: detail.hub ?? "",
    paymentMethod: detail.paymentMethod,
    memo: detail.memo ?? "",
    partner: detail.partner ?? "",
    crmUserId: detail.crmUserId ? String(detail.crmUserId) : "",
    salesType: detail.salesType ?? "",
    salesSource: detail.salesSource ?? "",
    items: detail.items.map((item) => ({
      key: `existing-${item.id}`,
      rowKind: item.itemType === "SALE" ? "SALE" : "BONUS_SAMPLE",
      productInternalId: item.productInternalId,
      itemType: item.itemType,
      quantity: item.quantity,
    })),
    shippingCharge: detail.shippingCharge,
    packingCharge: detail.packingCharge,
    discount: detail.discount,
    codAdmin: detail.codAdmin,
    crmVoucher: detail.crmVoucher,
  };
}

function num(value: string): number {
  const parsed = Number(value.replace(/[^\d-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PesananForm({
  mode,
  orderId,
  initialDetail,
  prefill,
  productOptions,
  crmOptions,
  defaultCrmUserId,
  initialTaskId,
}: {
  mode: "create" | "edit";
  orderId?: number;
  initialDetail?: WorkspaceOrderDetail | null;
  /** Pre-isi ringan dari Pembagian Tugas (nama/HP customer) — bukan edit data lengkap. */
  prefill?: { customerName?: string; phone?: string };
  productOptions: WorkspaceProductOption[];
  crmOptions: { id: number; name: string }[];
  defaultCrmUserId: string;
  initialTaskId?: number;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(() => {
    if (initialDetail) return formFromDetail(initialDetail);
    const base = emptyForm(defaultCrmUserId);
    return prefill ? { ...base, customerName: prefill.customerName ?? base.customerName, phone: prefill.phone ?? base.phone } : base;
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteReason, setDeleteReason] = React.useState("");
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [statusTarget, setStatusTarget] = React.useState<WorkspaceOrderStatusChangeTarget | "">("");
  const [statusReason, setStatusReason] = React.useState("");
  const [statusRefundAmount, setStatusRefundAmount] = React.useState("");
  const [statusBusy, setStatusBusy] = React.useState(false);

  const productById = React.useMemo(() => new Map(productOptions.map((p) => [p.id, p])), [productOptions]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setForm((prev) => ({ ...prev, items: prev.items.map((item) => (item.key === key ? { ...item, ...patch } : item)) }));
  }

  function removeItem(key: string) {
    setForm((prev) => ({ ...prev, items: prev.items.filter((item) => item.key !== key) }));
  }

  const calc = React.useMemo(() => {
    let totalSalesValue = 0;
    let cosSale = 0;
    let cosBonus = 0;
    const rows = form.items.map((item) => {
      const product = item.productInternalId ? productById.get(item.productInternalId) : undefined;
      const sellingPrice = item.itemType === "SALE" ? Number(product?.sellingPrice ?? 0) : 0;
      const unitHpp = Number(product?.unitHpp ?? 0);
      const qty = num(item.quantity);
      const lineSales = item.itemType === "SALE" ? qty * sellingPrice : 0;
      const lineHpp = qty * unitHpp;
      totalSalesValue += lineSales;
      if (item.itemType === "SALE") cosSale += lineHpp;
      else cosBonus += lineHpp;
      return { ...item, product, sellingPrice, lineSales, lineHpp };
    });
    const codAdmin = form.paymentMethod === "TRANSFER" ? 0 : num(form.codAdmin);
    const orderTotal = totalSalesValue + num(form.shippingCharge) + num(form.packingCharge) + codAdmin - num(form.discount) - num(form.crmVoucher);
    return { rows, totalSalesValue, cosSale, cosBonus, totalCos: cosSale + cosBonus, codAdmin, orderTotal };
  }, [form.items, form.paymentMethod, form.shippingCharge, form.packingCharge, form.discount, form.crmVoucher, form.codAdmin, productById]);

  function productOptionsFor(row: ItemRow): ComboboxOption[] {
    const wantType: WorkspaceItemType = row.rowKind === "SALE" ? "SALE" : row.itemType;
    return productOptions
      .filter((product) => allowedItemTypesForUsage(product.productUsage as WorkspaceProductUsage).includes(wantType))
      .map((product) => ({ value: String(product.id), label: `${product.productId} — ${product.productName}`, description: product.sellingPrice ? formatRupiah(product.sellingPrice) : "Bonus/Sample" }));
  }

  /** `confirmImmediately` = tombol "Simpan & Konfirmasi" (mode create saja) —
   *  data harus lengkap (No Order sudah ada) supaya pesanan lahir langsung
   *  CONFIRMED, bukan DRAFT. Kalau ragu / masih negosiasi / belum TF, pakai
   *  "Simpan sebagai Draft" — No Order boleh dikosongkan dulu. */
  async function handleSubmit(confirmImmediately: boolean) {
    setSaving(true);
    setError(null);
    try {
      if (calc.orderTotal < 0) throw new Error("TOTAL tidak boleh bernilai negatif");
      const validItems = form.items.filter((item) => item.productInternalId != null);
      if (validItems.length === 0) throw new Error("Minimal satu produk harus dipilih");
      if (confirmImmediately && !form.sourceOrderId.trim()) {
        throw new Error("No Order/ID Pesanan wajib diisi untuk Simpan & Konfirmasi. Isi dulu, atau pakai \"Simpan sebagai Draft\".");
      }

      const payload = {
        orderDate: form.orderDate,
        sourceOrderId: form.sourceOrderId.trim() || null,
        customerName: form.customerName,
        phone: form.phone,
        address: form.address || null,
        city: form.city || null,
        district: form.district || null,
        postalCode: form.postalCode || null,
        expedition: form.expedition || null,
        hub: form.hub || null,
        paymentMethod: form.paymentMethod,
        memo: form.memo || null,
        partner: form.partner || null,
        crmUserId: Number(form.crmUserId),
        salesType: form.salesType || null,
        salesSource: form.salesSource || null,
        items: validItems.map((item) => ({ productInternalId: item.productInternalId!, itemType: item.itemType, quantity: num(item.quantity) })),
        shippingCharge: num(form.shippingCharge),
        packingCharge: num(form.packingCharge),
        discount: num(form.discount),
        codAdmin: num(form.codAdmin),
        crmVoucher: num(form.crmVoucher),
      };

      if (mode === "edit" && orderId) {
        await updateWorkspacePesananAction(orderId, payload);
        toast.success("Pesanan berhasil diperbarui");
        router.push(`/workspace/pesanan`);
      } else {
        const newId = await createWorkspacePesananAction(payload, initialTaskId, confirmImmediately);
        toast.success(confirmImmediately ? "Pesanan berhasil dibuat & dikonfirmasi" : "Pesanan berhasil disimpan sebagai Draft");
        router.push(`/workspace/pesanan`);
        void newId;
      }
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal menyimpan pesanan");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!orderId) return;
    setDeleteBusy(true);
    try {
      await deleteWorkspacePesananAction(orderId, { reason: deleteReason.trim() || undefined });
      toast.success("Pesanan dihapus");
      router.push("/workspace/pesanan");
      router.refresh();
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Gagal menghapus pesanan");
      setDeleteBusy(false);
    }
  }

  /** Terapkan perubahan status (panel "Ubah Status Pesanan") — mendelegasikan
   *  ke aksi single yang sama dengan bulk (confirm/cancel/return/refund),
   *  jadi jejak audit tetap satu jalur yang sama. CONFIRMED dari status apa
   *  pun (bukan cuma DRAFT) -> customer yang tadinya batal/retur/refund pesan
   *  lagi; setelah berhasil pesanan otomatis pindah tab sesuai status barunya. */
  async function handleStatusChange() {
    if (!orderId || !statusTarget) return;
    setStatusBusy(true);
    try {
      if (statusTarget === "CONFIRMED") await confirmWorkspacePesananAction(orderId, statusReason.trim() || undefined);
      else if (statusTarget === "CANCELLED") await cancelWorkspacePesananAction(orderId, statusReason.trim() || undefined);
      else if (statusTarget === "RETURNED") await markWorkspacePesananReturnedAction(orderId, { reason: statusReason.trim() || undefined });
      else await markWorkspacePesananRefundedAction(orderId, { refundAmount: statusRefundAmount, reason: statusReason.trim() || undefined });
      toast.success(`Status pesanan diubah ke ${STATUS_TARGET_LABELS[statusTarget]}`);
      router.push("/workspace/pesanan");
      router.refresh();
    } catch (statusError) {
      toast.error(statusError instanceof Error ? statusError.message : "Gagal mengubah status pesanan");
      setStatusBusy(false);
    }
  }

  const busy = saving;

  // CONFIRMED tidak ditawarkan sampai No Order/ID Pesanan TERSIMPAN (bukan
  // sekadar diketik di form ini) — server (confirmWorkspaceOrder) menolaknya
  // juga, tapi disaring di sini supaya CRM tidak kaget "kok gagal" kalau lupa
  // klik Simpan dulu setelah mengisi No Order.
  const hasSavedSourceOrderId = Boolean(initialDetail?.sourceOrderId?.trim());
  const statusTargets = initialDetail
    ? availableStatusTargets(initialDetail.status).filter((target) => target !== "CONFIRMED" || hasSavedSourceOrderId)
    : [];
  const confirmedHiddenByMissingSourceOrderId =
    initialDetail != null && !hasSavedSourceOrderId && availableStatusTargets(initialDetail.status).includes("CONFIRMED");

  return (
    <div className="space-y-3">
      {mode === "edit" && initialDetail ? (
        <Panel title="Ubah Status Pesanan">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Status saat ini:</span>
            <Badge variant={STATUS_VARIANT[initialDetail.status]}>{initialDetail.status}</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Ubah ke">
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={statusTarget}
                onChange={(e) => {
                  const next = e.target.value as WorkspaceOrderStatusChangeTarget | "";
                  setStatusTarget(next);
                  if (next === "REFUNDED") setStatusRefundAmount(initialDetail.orderTotal);
                }}
                disabled={statusBusy}
              >
                <option value="">Tidak diubah</option>
                {statusTargets.map((target) => (
                  <option key={target} value={target}>
                    {STATUS_TARGET_LABELS[target]}
                  </option>
                ))}
              </select>
            </Field>
            {statusTarget === "REFUNDED" ? (
              <Field label={`Nominal Refund (maks. ${formatRupiah(initialDetail.orderTotal)})`}>
                <Input
                  type="number"
                  min={1}
                  max={Number(initialDetail.orderTotal)}
                  value={statusRefundAmount}
                  onChange={(e) => setStatusRefundAmount(e.target.value)}
                  disabled={statusBusy}
                />
              </Field>
            ) : null}
          </div>
          {confirmedHiddenByMissingSourceOrderId ? (
            <p className="text-[10px] text-muted-foreground">Isi &amp; simpan No Order/ID Pesanan dulu (di atas) supaya bisa diubah ke Confirmed.</p>
          ) : null}
          {statusTarget ? (
            <>
              <Field label="Catatan">
                <Textarea rows={1} value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder="Karena apa? (opsional)" disabled={statusBusy} />
              </Field>
              {statusTarget === "REFUNDED" ? (
                <p className="text-[10px] text-muted-foreground">Nominal sama dengan TOTAL pesanan -&gt; REFUNDED. Kurang dari itu -&gt; PARTIALLY_REFUNDED.</p>
              ) : null}
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={handleStatusChange} disabled={statusBusy || (statusTarget === "REFUNDED" && !statusRefundAmount)}>
                  {statusBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Terapkan Perubahan Status
                </Button>
              </div>
            </>
          ) : null}
        </Panel>
      ) : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}

      <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1.2fr_0.9fr]">
        <Panel title="Data Konsumen">
          <Field label="No Order / ID Pesanan (Everpro)">
            <Input value={form.sourceOrderId} onChange={(e) => updateField("sourceOrderId", e.target.value)} placeholder="Belum ada -> tetap Draft Pesanan" />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Untuk tracking data di Everpro. Boleh dikosongkan dulu — pesanan tanpa nomor ini tetap di tab Draft Pesanan, wajib diisi sebelum bisa dikonfirmasi.
            </p>
          </Field>
          <Field label="Tanggal Pesanan" required>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button type="button" className="flex h-8 w-full items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-[11px]">
                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  {form.orderDate}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={new Date(`${form.orderDate}T00:00:00Z`)}
                  onSelect={(date) => {
                    if (!date) return;
                    updateField("orderDate", new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(date));
                    setDatePickerOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </Field>
          <Field label="Nama Konsumen" required><Input value={form.customerName} onChange={(e) => updateField("customerName", e.target.value)} /></Field>
          <Field label="Nomor HP" required><Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="08xxxxxxxxxx" /></Field>
          <Field label="Alamat Lengkap"><Textarea rows={2} value={form.address} onChange={(e) => updateField("address", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Kota/Kabupaten"><Input value={form.city} onChange={(e) => updateField("city", e.target.value)} /></Field>
            <Field label="Kecamatan"><Input value={form.district} onChange={(e) => updateField("district", e.target.value)} /></Field>
          </div>
          <Field label="Kode Pos"><Input value={form.postalCode} onChange={(e) => updateField("postalCode", e.target.value)} /></Field>
        </Panel>

        <Panel title="Pengiriman dan Pembayaran">
          <Field label="Ekspedisi">
            <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={form.expedition} onChange={(e) => updateField("expedition", e.target.value)}>
              <option value="">Pilih ekspedisi</option>
              {EXPEDITION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Hub">
            <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={form.hub} onChange={(e) => updateField("hub", e.target.value)}>
              <option value="">Pilih hub</option>
              {HUB_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Pembayaran" required>
            <select
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={form.paymentMethod}
              onChange={(e) => updateField("paymentMethod", e.target.value as FormState["paymentMethod"])}
            >
              <option value="TRANSFER">TRANSFER</option>
              <option value="COD">COD</option>
            </select>
          </Field>
          <Field label="Memo"><Input value={form.memo} onChange={(e) => updateField("memo", e.target.value)} placeholder="mis. RO" /></Field>
          <Field label="Mitra"><Input value={form.partner} onChange={(e) => updateField("partner", e.target.value)} placeholder="mis. UP DM" /></Field>
        </Panel>

        <Panel title="Detail Produk">
          <div className="space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_74px_74px_86px_28px] gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
              <span>Produk</span><span>Jenis</span><span>QTY</span><span>Nilai</span><span />
            </div>
            {form.items.map((item) => (
              <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_74px_74px_86px_28px] items-center gap-1.5">
                <Combobox
                  value={item.productInternalId ? String(item.productInternalId) : null}
                  onChange={(value) => updateItem(item.key, { productInternalId: Number(value) })}
                  options={productOptionsFor(item)}
                  placeholder="Pilih produk"
                />
                {item.rowKind === "BONUS_SAMPLE" ? (
                  <select className="h-8 rounded-md border border-input bg-background px-1 text-[11px]" value={item.itemType} onChange={(e) => updateItem(item.key, { itemType: e.target.value as WorkspaceItemType, productInternalId: null })}>
                    <option value="BONUS">BONUS</option>
                    <option value="SAMPLE">SAMPLE</option>
                  </select>
                ) : (
                  <span className="text-center text-[11px] text-muted-foreground">SALE</span>
                )}
                <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: e.target.value })} className="h-8 text-[11px]" />
                <span className="text-right text-[11px] tabular">{formatRupiah(calc.rows.find((r) => r.key === item.key)?.lineSales ?? 0)}</span>
                <button type="button" onClick={() => removeItem(item.key)} className="text-muted-foreground hover:text-destructive" aria-label="Hapus baris">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 pt-1">
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setForm((prev) => ({ ...prev, items: [...prev.items, newRow("SALE")] }))}>
              <Plus className="h-3 w-3" aria-hidden="true" /> Tambah Produk
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setForm((prev) => ({ ...prev, items: [...prev.items, newRow("BONUS_SAMPLE")] }))}>
              <Plus className="h-3 w-3" aria-hidden="true" /> Tambah Bonus/Sampel
            </Button>
          </div>

          <div className="border-t pt-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">Biaya dan Pengurang</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Ongkir"><Input type="number" min={0} value={form.shippingCharge} onChange={(e) => updateField("shippingCharge", e.target.value)} /></Field>
              <Field label="Packing"><Input type="number" min={0} value={form.packingCharge} onChange={(e) => updateField("packingCharge", e.target.value)} /></Field>
              <Field label="Diskon"><Input type="number" min={0} value={form.discount} onChange={(e) => updateField("discount", e.target.value)} /></Field>
              <Field label="Admin COD">
                <Input type="number" min={0} value={form.paymentMethod === "TRANSFER" ? "0" : form.codAdmin} onChange={(e) => updateField("codAdmin", e.target.value)} disabled={form.paymentMethod === "TRANSFER"} />
              </Field>
              <Field label="Voucher CRM"><Input type="number" min={0} value={form.crmVoucher} onChange={(e) => updateField("crmVoucher", e.target.value)} /></Field>
            </div>
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel title="Informasi Sales">
            <Field label="Nama CRM" required>
              <Combobox value={form.crmUserId || null} onChange={(value) => updateField("crmUserId", value)} options={crmOptions.map((c) => ({ value: String(c.id), label: c.name }))} placeholder="Pilih CRM" />
            </Field>
            <Field label="Type Sales">
              <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={form.salesType} onChange={(e) => updateField("salesType", e.target.value)}>
                <option value="">Pilih type sales</option>
                {SALES_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Sumber Penjualan">
              <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={form.salesSource} onChange={(e) => updateField("salesSource", e.target.value)}>
                <option value="">Pilih sumber</option>
                {SALES_SOURCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </Panel>

          <Panel title="Ringkasan Perhitungan">
            <SummaryRow label="Total Nilai Produk" value={calc.totalSalesValue} />
            <SummaryRow label="Ongkir" value={num(form.shippingCharge)} />
            <SummaryRow label="Packing" value={num(form.packingCharge)} />
            <SummaryRow label="Admin COD" value={calc.codAdmin} />
            <SummaryRow label="Diskon" value={num(form.discount)} negative />
            <SummaryRow label="Voucher CRM" value={num(form.crmVoucher)} negative />
            <div className="flex items-center justify-between border-t pt-1.5 text-sm font-bold">
              <span>TOTAL</span>
              <span className={calc.orderTotal < 0 ? "text-destructive" : ""}>{formatRupiah(calc.orderTotal)}</span>
            </div>
            <div className="mt-2 space-y-0.5 border-t pt-1.5 text-muted-foreground">
              {calc.rows.some((row) => row.product) ? (
                <div className="space-y-0.5 pb-1.5">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Rincian HPP per Produk</p>
                  {calc.rows
                    .filter((row) => row.product)
                    .map((row) => (
                      <div key={row.key} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="truncate">
                          {row.product!.productId} — {row.product!.productName} ({row.quantity}x{row.itemType !== "SALE" ? ` ${row.itemType}` : ""})
                        </span>
                        <span className="shrink-0 tabular">{formatRupiah(row.lineHpp)}</span>
                      </div>
                    ))}
                </div>
              ) : null}
              <SummaryRow label="COS Produk SALE" value={calc.cosSale} small />
              <SummaryRow label="COS Bonus/Sampel" value={calc.cosBonus} small />
              <SummaryRow label="Total COS" value={calc.totalCos} small />
              <div className="flex items-center justify-between pt-1 text-xs font-semibold text-foreground">
                <span>Margin Sebelum COM</span>
                <span>{formatRupiah(calc.orderTotal - calc.totalCos)}</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {deleting ? (
        <div className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
          <p className="text-[11px] font-medium">Alasan penghapusan</p>
          <Textarea rows={2} value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="Opsional" disabled={deleteBusy} />
          <p className="text-[10px] text-muted-foreground">
            Pesanan tidak dihapus permanen — hilang dari daftar, tapi baris & jejak audit tetap ada di database.
          </p>
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="outline" onClick={() => setDeleting(false)} disabled={deleteBusy}>Batal</Button>
            <Button type="button" size="sm" variant="destructive" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Hapus Pesanan
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          {mode === "edit" && orderId ? (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(true)} disabled={busy}>
              <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Hapus Pesanan
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={busy}>Batal</Button>
            {mode === "edit" ? (
              <Button type="button" size="sm" onClick={() => handleSubmit(false)} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Simpan
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => handleSubmit(false)} disabled={busy}>
                  {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Simpan sebagai Draft
                </Button>
                <Button type="button" size="sm" onClick={() => handleSubmit(true)} disabled={busy || !form.sourceOrderId.trim()} title={!form.sourceOrderId.trim() ? "Isi No Order/ID Pesanan dulu" : undefined}>
                  {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Simpan &amp; Konfirmasi
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border bg-card p-3">
      <h3 className="text-xs font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] normal-case">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, negative, small }: { label: string; value: number; negative?: boolean; small?: boolean }) {
  return (
    <div className={small ? "flex items-center justify-between text-[11px]" : "flex items-center justify-between text-xs"}>
      <span>{label}</span>
      <span className={negative && value > 0 ? "text-destructive" : ""}>
        {negative && value > 0 ? "-" : ""}
        {formatRupiah(value)}
      </span>
    </div>
  );
}
