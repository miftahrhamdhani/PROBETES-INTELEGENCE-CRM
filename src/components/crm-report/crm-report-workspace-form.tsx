"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Info, Loader2, Plus, Trash2 } from "lucide-react";
import { createCrmReportAction, updateCrmReportAction } from "@/app/crm-reports-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import { MAX_CRM_REPORT_ITEMS } from "@/lib/crm-report-contracts";
import type { CrmReportDetail } from "@/lib/crm-report-types";

interface ItemForm {
  productName: string;
  qty: string;
  productValue: string;
  itemNote: string;
}

interface ReportForm {
  customerName: string;
  phone: string;
  address: string;
  expedition: string;
  memo: string;
  paymentMethod: string;
  items: ItemForm[];
  shippingCost: string;
  packingCost: string;
  discount: string;
  adminCod: string;
  csName: string;
  advName: string;
  note: string;
  hub: string;
  city: string;
  reportDate: string;
  orderClosingCount: string;
  salesType: string;
  platform: string;
  division: string;
  dataReceivedCount: string;
  crmVoucher: string;
  codValue: string;
  recipientDistrict: string;
  recipientPostalCode: string;
  partner: string;
  crmMarketingCost: string;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EMPTY_ITEM: ItemForm = { productName: "", qty: "1", productValue: "0", itemNote: "" };

function emptyForm(): ReportForm {
  return {
    customerName: "",
    phone: "",
    address: "",
    expedition: "",
    memo: "",
    paymentMethod: "",
    items: [{ ...EMPTY_ITEM }],
    shippingCost: "0",
    packingCost: "0",
    discount: "0",
    adminCod: "0",
    csName: "",
    advName: "",
    note: "",
    hub: "",
    city: "",
    reportDate: todayKey(),
    orderClosingCount: "",
    salesType: "",
    platform: "",
    division: "",
    dataReceivedCount: "",
    crmVoucher: "",
    codValue: "0",
    recipientDistrict: "",
    recipientPostalCode: "",
    partner: "",
    crmMarketingCost: "0",
  };
}

function formFromDetail(detail: CrmReportDetail): ReportForm {
  return {
    customerName: detail.customerName,
    phone: detail.phone,
    address: detail.address ?? "",
    expedition: detail.expedition ?? "",
    memo: detail.memo ?? "",
    paymentMethod: detail.paymentMethod ?? "",
    items: detail.items.length
      ? detail.items.map((i) => ({ productName: i.productName, qty: i.qty, productValue: i.productValue, itemNote: i.itemNote ?? "" }))
      : [{ ...EMPTY_ITEM }],
    shippingCost: detail.shippingCost,
    packingCost: detail.packingCost,
    discount: detail.discount,
    adminCod: detail.adminCod,
    csName: detail.csName ?? "",
    advName: detail.advName ?? "",
    note: detail.note ?? "",
    hub: detail.hub ?? "",
    city: detail.city ?? "",
    reportDate: detail.reportDate,
    orderClosingCount: detail.orderClosingCount != null ? String(detail.orderClosingCount) : "",
    salesType: detail.salesType ?? "",
    platform: detail.platform ?? "",
    division: detail.division ?? "",
    dataReceivedCount: detail.dataReceivedCount != null ? String(detail.dataReceivedCount) : "",
    crmVoucher: detail.crmVoucher ?? "",
    codValue: detail.codValue,
    recipientDistrict: detail.recipientDistrict ?? "",
    recipientPostalCode: detail.recipientPostalCode ?? "",
    partner: detail.partner ?? "",
    crmMarketingCost: detail.crmMarketingCost,
  };
}

function n(value: string): number {
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Halaman penuh Input/Edit Laporan CRM — pengganti CrmReportFormDialog (modal).
 * Backend TIDAK berubah: tetap createCrmReportAction/updateCrmReportAction,
 * crm_reports/crm_report_items, dan "CRM Report BUKAN canonical order".
 * Redesign murni layout & pengalaman input (workspace penuh, tabel produk
 * spreadsheet-style, panel ringkasan kanan yang real-time).
 */
export function CrmReportWorkspaceForm({
  mode,
  reportId,
  initialData,
  productNameOptions,
  platformOptions,
}: {
  mode: "create" | "edit";
  reportId?: number;
  initialData?: CrmReportDetail | null;
  productNameOptions: string[];
  platformOptions: string[];
}) {
  const router = useRouter();
  const initialForm = React.useMemo(() => (initialData ? formFromDetail(initialData) : emptyForm()), [initialData]);
  const [form, setForm] = React.useState<ReportForm>(initialForm);
  const [saving, setSaving] = React.useState<"save" | "save-new" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const productNameRefs = React.useRef<Array<HTMLInputElement | null>>([]);

  const totalProduk = form.items.reduce((sum, item) => sum + n(item.qty) * n(item.productValue), 0);
  const totalBayar = totalProduk + n(form.shippingCost) + n(form.packingCost) + n(form.adminCod) - n(form.discount);

  function updateField<K extends keyof ReportForm>(key: K, value: ReportForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function updateItem(index: number, patch: Partial<ItemForm>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) }));
  }
  function addItem(focus = false) {
    setForm((f) => {
      if (f.items.length >= MAX_CRM_REPORT_ITEMS) return f;
      const next = { ...f, items: [...f.items, { ...EMPTY_ITEM }] };
      if (focus) {
        const newIndex = next.items.length - 1;
        requestAnimationFrame(() => productNameRefs.current[newIndex]?.focus());
      }
      return next;
    });
  }
  function removeItem(index: number) {
    setForm((f) => (f.items.length <= 1 ? f : { ...f, items: f.items.filter((_, i) => i !== index) }));
  }
  function handleRowKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (index === form.items.length - 1) addItem(true);
    else productNameRefs.current[index + 1]?.focus();
  }

  function buildPayload() {
    return {
      customerName: form.customerName,
      phone: form.phone,
      address: form.address || null,
      expedition: form.expedition || null,
      memo: form.memo || null,
      paymentMethod: form.paymentMethod || null,
      items: form.items
        .filter((i) => i.productName.trim())
        .map((i) => ({
          productName: i.productName,
          qty: n(i.qty) || 1,
          productValue: n(i.productValue),
          itemNote: i.itemNote || null,
        })),
      shippingCost: n(form.shippingCost),
      packingCost: n(form.packingCost),
      discount: n(form.discount),
      adminCod: n(form.adminCod),
      totalPayment: totalBayar,
      csName: form.csName || null,
      advName: form.advName || null,
      note: form.note || null,
      hub: form.hub || null,
      city: form.city || null,
      reportDate: form.reportDate,
      orderClosingCount: form.orderClosingCount ? Number(form.orderClosingCount) : null,
      salesType: form.salesType || null,
      platform: form.platform || null,
      division: form.division || null,
      dataReceivedCount: form.dataReceivedCount ? Number(form.dataReceivedCount) : null,
      crmVoucher: form.crmVoucher || null,
      codValue: n(form.codValue),
      recipientDistrict: form.recipientDistrict || null,
      recipientPostalCode: form.recipientPostalCode || null,
      partner: form.partner || null,
      crmMarketingCost: n(form.crmMarketingCost),
    };
  }

  async function handleSave(intent: "save" | "save-new") {
    setSaving(intent);
    setError(null);
    setSuccess(null);
    try {
      const payload = buildPayload();
      if (payload.items.length === 0) throw new Error("Minimal satu produk harus diisi");

      if (mode === "edit" && reportId) {
        await updateCrmReportAction(reportId, payload);
      } else {
        await createCrmReportAction(payload);
      }

      if (intent === "save-new") {
        if (mode === "edit") {
          router.push("/workspace/input-kerja/baru");
          return;
        }
        setForm(emptyForm());
        setSuccess("Laporan tersimpan — silakan input laporan berikutnya.");
        productNameRefs.current[0]?.focus();
      } else {
        router.push("/workspace/input-kerja");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan laporan");
    } finally {
      setSaving(null);
    }
  }

  function handleReset() {
    setForm(initialForm);
    setError(null);
    setSuccess(null);
  }

  function handleCancel() {
    router.back();
  }

  const busy = saving !== null;

  const actionButtons = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={busy}>
        Batal
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={busy}>
        Reset
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => handleSave("save-new")} disabled={busy}>
        {saving === "save-new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
        Simpan &amp; Tambah Baru
      </Button>
      <Button type="button" size="sm" onClick={() => handleSave("save")} disabled={busy}>
        {saving === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
        Simpan
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Catat transaksi closing manual dari customer — bukan order kanonik.</p>
        {actionButtons}
      </div>

      {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p> : null}
      {success ? (
        <p className="flex items-center gap-1.5 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {success}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px] xl:items-start">
        {/* Kolom utama */}
        <div className="space-y-4">
          <Card>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
              <Field label="Nama Konsumen" required>
                <Input value={form.customerName} onChange={(e) => updateField("customerName", e.target.value)} placeholder="Nama customer" />
              </Field>
              <Field label="No HP" required>
                <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="0812xxxxxxx" />
              </Field>
              <Field label="Tanggal" required>
                <Input type="date" value={form.reportDate} onChange={(e) => updateField("reportDate", e.target.value)} />
              </Field>
              <Field label="Kota">
                <Input value={form.city} onChange={(e) => updateField("city", e.target.value)} />
              </Field>

              <Field label="Alamat" full>
                <Textarea rows={2} value={form.address} onChange={(e) => updateField("address", e.target.value)} />
              </Field>

              <Field label="Kecamatan Penerima">
                <Input value={form.recipientDistrict} onChange={(e) => updateField("recipientDistrict", e.target.value)} />
              </Field>
              <Field label="Kode Pos Penerima">
                <Input value={form.recipientPostalCode} onChange={(e) => updateField("recipientPostalCode", e.target.value)} />
              </Field>
              <Field label="Ekspedisi">
                <Input value={form.expedition} onChange={(e) => updateField("expedition", e.target.value)} placeholder="mis. JNE" />
              </Field>
              <Field label="Hub">
                <Input value={form.hub} onChange={(e) => updateField("hub", e.target.value)} />
              </Field>
              <Field label="Mitra">
                <Input value={form.partner} onChange={(e) => updateField("partner", e.target.value)} />
              </Field>
              <Field label="Pembayaran">
                <Input value={form.paymentMethod} onChange={(e) => updateField("paymentMethod", e.target.value)} placeholder="mis. Transfer / COD" />
              </Field>
              <Field label="Nama CS">
                <Input value={form.csName} onChange={(e) => updateField("csName", e.target.value)} />
              </Field>
              <Field label="Nama ADV">
                <Input value={form.advName} onChange={(e) => updateField("advName", e.target.value)} />
              </Field>
              <Field label="Platform">
                <Input list="platform-options" value={form.platform} onChange={(e) => updateField("platform", e.target.value)} />
                <datalist id="platform-options">
                  {platformOptions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Field>
              <Field label="Divisi">
                <Input value={form.division} onChange={(e) => updateField("division", e.target.value)} />
              </Field>
              <Field label="Type Sales">
                <Input value={form.salesType} onChange={(e) => updateField("salesType", e.target.value)} />
              </Field>
              <Field label="Jumlah Order Closing">
                <Input type="number" min={0} value={form.orderClosingCount} onChange={(e) => updateField("orderClosingCount", e.target.value)} />
              </Field>
              <Field label="Jumlah Terima Data">
                <Input type="number" min={0} value={form.dataReceivedCount} onChange={(e) => updateField("dataReceivedCount", e.target.value)} />
              </Field>
              <Field label="Voucher CRM">
                <Input value={form.crmVoucher} onChange={(e) => updateField("crmVoucher", e.target.value)} />
              </Field>
              <Field label="Nilai COD">
                <Input type="number" min={0} value={form.codValue} onChange={(e) => updateField("codValue", e.target.value)} />
              </Field>
              <Field label="Biaya Marketing CRM">
                <Input type="number" min={0} value={form.crmMarketingCost} onChange={(e) => updateField("crmMarketingCost", e.target.value)} />
              </Field>
              <Field label="Catatan / Memo" full>
                <Textarea rows={2} value={form.memo} onChange={(e) => updateField("memo", e.target.value)} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="w-10 px-2 py-2.5 text-center">No</th>
                      <th className="px-2 py-2.5 text-left">Nama Produk</th>
                      <th className="w-24 px-2 py-2.5 text-center">Qty</th>
                      <th className="w-36 px-2 py-2.5 text-right">Nilai Produk (Rp)</th>
                      <th className="px-2 py-2.5 text-left">Catatan Item</th>
                      <th className="w-12 px-2 py-2.5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((item, index) => (
                      <tr key={index} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-2 text-center text-xs tabular text-muted-foreground">{index + 1}</td>
                        <td className="p-0">
                          <input
                            ref={(el) => {
                              productNameRefs.current[index] = el;
                            }}
                            list="product-name-options"
                            className="h-10 w-full border-0 bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
                            value={item.productName}
                            onChange={(e) => updateItem(index, { productName: e.target.value })}
                            onKeyDown={(e) => handleRowKeyDown(e, index)}
                            placeholder="Nama produk"
                          />
                        </td>
                        <td className="p-0">
                          <input
                            type="number"
                            min={1}
                            className="h-10 w-full border-0 bg-transparent px-2 text-center text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
                            value={item.qty}
                            onChange={(e) => updateItem(index, { qty: e.target.value })}
                            onKeyDown={(e) => handleRowKeyDown(e, index)}
                          />
                        </td>
                        <td className="p-0">
                          <input
                            type="number"
                            min={0}
                            className="h-10 w-full border-0 bg-transparent px-2 text-right text-sm tabular outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
                            value={item.productValue}
                            onChange={(e) => updateItem(index, { productValue: e.target.value })}
                            onKeyDown={(e) => handleRowKeyDown(e, index)}
                          />
                        </td>
                        <td className="p-0">
                          <input
                            className="h-10 w-full border-0 bg-transparent px-2 text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
                            value={item.itemNote}
                            onChange={(e) => updateItem(index, { itemNote: e.target.value })}
                            onKeyDown={(e) => handleRowKeyDown(e, index)}
                            placeholder="—"
                          />
                        </td>
                        <td className="px-1 text-center">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeItem(index)}
                            disabled={form.items.length <= 1}
                            aria-label="Hapus baris"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <datalist id="product-name-options">
                  {productNameOptions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div className="flex items-center justify-between border-t px-3 py-2.5">
                <Button type="button" size="sm" variant="outline" onClick={() => addItem(true)} disabled={form.items.length >= MAX_CRM_REPORT_ITEMS}>
                  <Plus className="h-3.5 w-3.5" /> Tambah Baris
                </Button>
                <p className="text-[11px] text-muted-foreground">Maksimal {MAX_CRM_REPORT_ITEMS} item produk</p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">{actionButtons}</div>
        </div>

        {/* Panel kanan */}
        <div className="space-y-4 xl:sticky xl:top-20">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Ringkasan Perhitungan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-xs">
              <SummaryRow label="Total Nilai Produk" value={totalProduk} />
              <SummaryRow label="Ongkir" value={n(form.shippingCost)} />
              <SummaryRow label="Packing" value={n(form.packingCost)} />
              <SummaryRow label="Diskon" value={-n(form.discount)} />
              <SummaryRow label="Admin COD" value={n(form.adminCod)} />
              <div className="mt-2 border-t pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide">Total Bayar</span>
                  <span className="text-lg font-bold tabular text-primary">{formatRupiah(BigInt(Math.max(0, Math.round(totalBayar))))}</span>
                </div>
              </div>
              <div className="mt-2 flex items-start gap-1.5 rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                <span>Total diperbarui otomatis — pastikan semua nilai sudah sesuai sebelum menyimpan.</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Catatan Internal</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Textarea
                rows={4}
                maxLength={2000}
                value={form.note}
                onChange={(e) => updateField("note", e.target.value)}
                placeholder="Catatan internal untuk tim (tidak tampil ke customer)"
              />
              <p className="mt-1 text-right text-[10px] text-muted-foreground">{form.note.length}/2000 karakter</p>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Tips Input Cepat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0 text-[11px] text-muted-foreground">
              <TipRow>Gunakan Tab/Enter untuk berpindah field</TipRow>
              <TipRow>Isi Nama Produk lalu tekan Enter untuk tambah baris cepat</TipRow>
              <TipRow>Pastikan No HP valid untuk menghindari duplikasi customer</TipRow>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full, required }: { label: string; children: React.ReactNode; full?: boolean; required?: boolean }) {
  return (
    <div className={full ? "col-span-full space-y-1" : "space-y-1"}>
      <Label className="text-[11px]">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  const negative = value < 0;
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={negative ? "tabular text-destructive" : "tabular"}>
        {negative ? "-" : ""}
        {formatRupiah(BigInt(Math.round(Math.abs(value))))}
      </span>
    </div>
  );
}

function TipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5">
      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
