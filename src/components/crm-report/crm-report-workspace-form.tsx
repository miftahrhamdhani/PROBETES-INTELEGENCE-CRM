"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createCrmReportAction, updateCrmReportAction } from "@/app/crm-reports-actions";
import { CrmReportManager } from "@/components/crm-report/crm-report-manager";
import { Button } from "@/components/ui/button";
import { calculateCrmReportTotals, parseCrmNumber } from "@/lib/crm-report-calculation";
import { MAX_CRM_REPORT_ITEMS } from "@/lib/crm-report-contracts";
import type { CrmReportDetail, CrmReportListResult, CrmReportRow } from "@/lib/crm-report-types";
import { formatRupiah } from "@/lib/format";

interface ItemForm {
  productName: string;
  qty: string;
  productValue: string;
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

type SheetField = {
  key: Exclude<keyof ReportForm, "items">;
  label: string;
  type?: "date" | "number";
  options?: string[];
  required?: boolean;
  uppercase?: boolean;
  min?: number;
  placeholder?: string;
};

const EXPEDITION_OPTIONS = ["JNE", "J&T", "SICEPAT", "ANTERAJA", "NINJA", "POS INDONESIA", "LION PARCEL", "GOSEND", "GRABEXPRESS", "DIGITAL"];
const PAYMENT_OPTIONS = ["TRANSFER", "COD", "MARKETPLACE", "QRIS", "CASH"];
const HUB_OPTIONS = ["JAKARTA", "BANDUNG", "SURABAYA", "YOGYAKARTA", "MEDAN", "MAKASSAR", "DIGITAL"];
const SALES_TYPE_OPTIONS = ["CLOSING", "REPEAT ORDER", "UPSELL", "RESELLER"];
const PLATFORM_OPTIONS = ["META", "SHOPEE", "TIKTOK", "WHATSAPP", "WEBSITE"];
const DIVISION_OPTIONS = ["CRM", "AKUISISI", "TIKTOK MP"];
const EMPTY_ITEM: ItemForm = { productName: "", qty: "", productValue: "" };

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function upper(value: string): string {
  return value.toLocaleUpperCase("id-ID");
}

function emptyForm(): ReportForm {
  return {
    customerName: "",
    phone: "",
    address: "",
    expedition: "",
    memo: "",
    paymentMethod: "",
    items: Array.from({ length: MAX_CRM_REPORT_ITEMS }, () => ({ ...EMPTY_ITEM })),
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
    division: "CRM",
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
  const items = Array.from({ length: MAX_CRM_REPORT_ITEMS }, (_, index) => {
    const item = detail.items[index];
    return item ? { productName: item.productName, qty: item.qty, productValue: item.productValue } : { ...EMPTY_ITEM };
  });
  return {
    customerName: detail.customerName,
    phone: detail.phone,
    address: detail.address ?? "",
    expedition: detail.expedition ?? "",
    memo: detail.memo ?? "",
    paymentMethod: detail.paymentMethod ?? "",
    items,
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
    division: detail.division ?? "CRM",
    dataReceivedCount: detail.dataReceivedCount != null ? String(detail.dataReceivedCount) : "",
    crmVoucher: detail.crmVoucher ?? "",
    codValue: detail.codValue,
    recipientDistrict: detail.recipientDistrict ?? "",
    recipientPostalCode: detail.recipientPostalCode ?? "",
    partner: detail.partner ?? "",
    crmMarketingCost: detail.crmMarketingCost,
  };
}

function money(value: number): string {
  return formatRupiah(BigInt(Math.max(0, Math.round(value))));
}

export function CrmReportWorkspaceForm({
  mode,
  reportId,
  initialData,
  productNameOptions,
  platformOptions,
  initialList,
}: {
  mode: "create" | "edit";
  reportId?: number;
  initialData?: CrmReportDetail | null;
  productNameOptions: string[];
  platformOptions: string[];
  initialList: CrmReportListResult;
}) {
  const router = useRouter();
  const initialForm = React.useMemo(() => (initialData ? formFromDetail(initialData) : emptyForm()), [initialData]);
  const [form, setForm] = React.useState<ReportForm>(initialForm);
  const [saving, setSaving] = React.useState<"save" | "save-new" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [listReloadKey, setListReloadKey] = React.useState(0);
  const customerNameRef = React.useRef<HTMLInputElement | null>(null);
  const sheetRef = React.useRef<HTMLDivElement | null>(null);

  const { totalProductValue, totalPayment } = calculateCrmReportTotals(form.items, {
    shippingCost: form.shippingCost,
    packingCost: form.packingCost,
    discount: form.discount,
    adminCod: form.adminCod,
  });
  const totalQty = form.items.reduce((sum, item) => sum + parseCrmNumber(item.qty), 0);
  const productSummary = form.items
    .filter((item) => item.productName.trim())
    .map((item) => `${item.productName}${item.qty ? ` x${item.qty}` : ""}`)
    .join(", ");
  const mergedPlatformOptions = [...new Set([...PLATFORM_OPTIONS, ...platformOptions.map(upper)])];
  const previewRow: CrmReportRow = {
    id: -1,
    customerId: null,
    customerName: form.customerName || "—",
    phone: form.phone || "—",
    address: form.address || null,
    city: form.city || null,
    recipientDistrict: form.recipientDistrict || null,
    expedition: form.expedition || null,
    paymentMethod: form.paymentMethod || null,
    csName: form.csName || null,
    advName: form.advName || null,
    platform: form.platform || null,
    division: form.division || null,
    salesType: form.salesType || null,
    reportDate: form.reportDate,
    totalQty: String(totalQty),
    totalProductValue: String(totalProductValue),
    shippingCost: String(parseCrmNumber(form.shippingCost)),
    packingCost: String(parseCrmNumber(form.packingCost)),
    discount: String(parseCrmNumber(form.discount)),
    adminCod: String(parseCrmNumber(form.adminCod)),
    totalPayment: String(totalPayment),
    itemsSummary: productSummary || "—",
    archivedAt: null,
    createdByName: null,
    taskId: null,
    taskType: null,
    taskStatus: null,
    taskOutcome: null,
    taskPicName: null,
  };

  const customerFields: SheetField[] = [
    { key: "customerName", label: "Nama Konsumen", required: true, uppercase: true, placeholder: "NAMA KONSUMEN" },
    { key: "phone", label: "No HP", required: true, placeholder: "08xxxxxxxxxx" },
    { key: "reportDate", label: "Tanggal", type: "date", required: true },
    { key: "city", label: "Kota", uppercase: true },
    { key: "recipientDistrict", label: "Kecamatan Penerima", uppercase: true },
    { key: "recipientPostalCode", label: "Kode Pos Penerima" },
    { key: "address", label: "Alamat", uppercase: true },
    { key: "expedition", label: "Ekspedisi", uppercase: true, options: EXPEDITION_OPTIONS },
    { key: "hub", label: "Hub", uppercase: true, options: HUB_OPTIONS },
    { key: "partner", label: "Mitra", uppercase: true },
  ];
  const salesFields: SheetField[] = [
    { key: "memo", label: "Memo", uppercase: true },
    { key: "paymentMethod", label: "Pembayaran", uppercase: true, options: PAYMENT_OPTIONS },
    { key: "csName", label: "Nama CS", uppercase: true },
    { key: "advName", label: "Nama ADV", uppercase: true },
    { key: "platform", label: "Platform", uppercase: true, options: mergedPlatformOptions },
    { key: "division", label: "Divisi", uppercase: true, options: DIVISION_OPTIONS },
    { key: "salesType", label: "Type Sales", uppercase: true, options: SALES_TYPE_OPTIONS },
    { key: "orderClosingCount", label: "Jumlah Order Closing", type: "number", min: 0 },
    { key: "dataReceivedCount", label: "Jumlah Terima Data", type: "number", min: 0 },
    { key: "shippingCost", label: "Ongkir", type: "number", min: 0 },
    { key: "packingCost", label: "Packing", type: "number", min: 0 },
    { key: "discount", label: "Diskon", type: "number", min: 0 },
    { key: "adminCod", label: "Admin COD", type: "number", min: 0 },
    { key: "crmVoucher", label: "Voucher CRM" },
    { key: "codValue", label: "Nilai COD", type: "number", min: 0 },
    { key: "crmMarketingCost", label: "Biaya Marketing CRM", type: "number", min: 0 },
    { key: "note", label: "Note", uppercase: true },
  ];

  function updateField<K extends keyof ReportForm>(key: K, value: ReportForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateItem(index: number, patch: Partial<ItemForm>) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  }

  function handleWorksheetEnter(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const cells = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>("input:not(:disabled), select:not(:disabled)") ?? []);
    const index = cells.indexOf(target);
    if (index < 0 || index >= cells.length - 1) return;
    event.preventDefault();
    cells[index + 1]?.focus();
  }

  function buildPayload() {
    return {
      customerName: upper(form.customerName),
      phone: form.phone,
      address: form.address ? upper(form.address) : null,
      expedition: form.expedition ? upper(form.expedition) : null,
      memo: form.memo ? upper(form.memo) : null,
      paymentMethod: form.paymentMethod ? upper(form.paymentMethod) : null,
      items: form.items
        .filter((item) => item.productName.trim())
        .map((item) => ({
          productName: upper(item.productName),
          qty: parseCrmNumber(item.qty) || 1,
          productValue: parseCrmNumber(item.productValue),
          itemNote: null,
        })),
      shippingCost: parseCrmNumber(form.shippingCost),
      packingCost: parseCrmNumber(form.packingCost),
      discount: parseCrmNumber(form.discount),
      adminCod: parseCrmNumber(form.adminCod),
      totalPayment,
      csName: form.csName ? upper(form.csName) : null,
      advName: form.advName ? upper(form.advName) : null,
      note: form.note ? upper(form.note) : null,
      hub: form.hub ? upper(form.hub) : null,
      city: form.city ? upper(form.city) : null,
      reportDate: form.reportDate,
      orderClosingCount: form.orderClosingCount ? Number(form.orderClosingCount) : null,
      salesType: form.salesType ? upper(form.salesType) : null,
      platform: form.platform ? upper(form.platform) : null,
      division: upper(form.division || "CRM"),
      dataReceivedCount: form.dataReceivedCount ? Number(form.dataReceivedCount) : null,
      crmVoucher: form.crmVoucher || null,
      codValue: parseCrmNumber(form.codValue),
      recipientDistrict: form.recipientDistrict ? upper(form.recipientDistrict) : null,
      recipientPostalCode: form.recipientPostalCode || null,
      partner: form.partner ? upper(form.partner) : null,
      crmMarketingCost: parseCrmNumber(form.crmMarketingCost),
    };
  }

  async function handleSave(intent: "save" | "save-new") {
    setSaving(intent);
    setError(null);
    setSuccess(null);
    try {
      const payload = buildPayload();
      if (!payload.customerName.trim()) throw new Error("Nama Konsumen wajib diisi");
      if (!payload.phone.trim()) throw new Error("No HP wajib diisi");
      if (payload.items.length === 0) throw new Error("Minimal Produk 1 harus diisi");

      if (mode === "edit" && reportId) await updateCrmReportAction(reportId, payload);
      else await createCrmReportAction(payload);

      setSuccess("Laporan berhasil disimpan.");
      toast.success("Laporan berhasil disimpan");
      setListReloadKey((key) => key + 1);
      if (intent === "save-new") {
        setForm(emptyForm());
        requestAnimationFrame(() => customerNameRef.current?.focus());
      }
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan laporan");
    } finally {
      setSaving(null);
    }
  }

  function handleReset() {
    setForm(initialForm);
    setError(null);
    setSuccess(null);
    requestAnimationFrame(() => customerNameRef.current?.focus());
  }

  const busy = saving !== null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Worksheet laporan closing CRM — terpisah dari order kanonik Database All.</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={busy}>Batal</Button>
          <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={busy}>Reset</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => handleSave("save-new")} disabled={busy}>
            {saving === "save-new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            Simpan &amp; Tambah Baru
          </Button>
          <Button type="button" size="sm" onClick={() => handleSave("save")} disabled={busy}>
            {saving === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            Simpan
          </Button>
        </div>
      </div>

      {error ? <p role="alert" className="border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p> : null}
      {success ? (
        <p role="status" className="flex items-center gap-1.5 border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {success}
        </p>
      ) : null}

      <div ref={sheetRef} className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(260px,1fr)] xl:items-start" onKeyDown={handleWorksheetEnter}>
        <div className="overflow-x-auto border bg-card">
          <div className="grid min-w-[1140px] grid-cols-[0.95fr_1.1fr_1fr] divide-x">
            <SheetBlock title="Data Konsumen">
              {customerFields.map((field) => (
                <SheetFieldRow
                  key={field.key}
                  field={field}
                  value={String(form[field.key])}
                  inputRef={field.key === "customerName" ? customerNameRef : undefined}
                  onChange={(value) => updateField(field.key, (field.uppercase ? upper(value) : value) as never)}
                />
              ))}
            </SheetBlock>

            <SheetBlock title="Detail Produk">
              {form.items.flatMap((item, index) => [
                <SheetProductRow key={`product-${index}`} label={`Produk ${index + 1}`} value={item.productName} options={productNameOptions} required={index === 0} onChange={(value) => updateItem(index, { productName: upper(value) })} />,
                <SheetProductRow key={`qty-${index}`} label={`QTY ${index + 1}`} type="number" value={item.qty} min={0} onChange={(value) => updateItem(index, { qty: value })} />,
                <SheetProductRow key={`value-${index}`} label={`Nilai Produk ${index + 1}`} type="number" value={item.productValue} min={0} onChange={(value) => updateItem(index, { productValue: value })} />,
              ])}
            </SheetBlock>

            <SheetBlock title="Sales dan Nilai">
              {salesFields.map((field) => (
                <SheetFieldRow
                  key={field.key}
                  field={field}
                  value={String(form[field.key])}
                  onChange={(value) => updateField(field.key, (field.uppercase ? upper(value) : value) as never)}
                />
              ))}
              <div className="grid min-h-9 grid-cols-[130px_22px_minmax(0,1fr)] border-b bg-primary/5 text-xs font-semibold">
                <span className="px-2 py-2">Total Bayar</span><span className="border-x px-1 py-2 text-center">:</span><span className="px-2 py-2 text-right tabular">{money(totalPayment)}</span>
              </div>
            </SheetBlock>
          </div>
        </div>

        <aside className="border bg-card xl:sticky xl:top-20">
          <h2 className="border-b px-4 py-3 text-sm font-semibold">Ringkasan Perhitungan</h2>
          <div className="divide-y text-xs">
            <SummaryRow label="Total Nilai Produk" value={totalProductValue} />
            <SummaryRow label="Ongkir" value={parseCrmNumber(form.shippingCost)} />
            <SummaryRow label="Packing" value={parseCrmNumber(form.packingCost)} />
            <SummaryRow label="Diskon" value={parseCrmNumber(form.discount)} negative />
            <SummaryRow label="Admin COD" value={parseCrmNumber(form.adminCod)} />
            <div className="grid grid-cols-[1fr_auto] items-center gap-4 bg-primary/5 px-4 py-4">
              <span className="text-sm font-bold uppercase">Total Bayar</span>
              <span className="text-2xl font-black tabular text-primary">{money(totalPayment)}</span>
            </div>
          </div>
        </aside>
      </div>

      <section className="space-y-3 border bg-card p-3">
        <div>
          <h2 className="text-sm font-semibold">Preview Tabel Hasil Input</h2>
          <p className="text-[11px] text-muted-foreground">Baris pertama adalah draft realtime. Baris berikutnya adalah seluruh laporan tersimpan; klik untuk edit, menu aksi untuk archive, export memakai filter existing.</p>
        </div>
        <CrmReportManager
          filter={{}}
          initialData={initialList}
          exportQuery=""
          previewRow={previewRow}
          reloadKey={listReloadKey}
          hideInputAction
        />
      </section>
    </div>
  );
}

function SheetBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="sticky top-0 z-10 border-b bg-muted/95 px-3 py-2 text-[11px] font-bold uppercase tracking-wide">{title}</h2>{children}</section>;
}

function SheetFieldRow({
  field,
  value,
  onChange,
  inputRef,
}: {
  field: SheetField;
  value: string;
  onChange: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="grid min-h-9 grid-cols-[130px_22px_minmax(0,1fr)] border-b text-xs last:border-b-0">
      <span className="px-2 py-2 font-medium">{field.label}{field.required ? <span className="text-destructive"> *</span> : null}</span>
      <span className="border-x px-1 py-2 text-center text-muted-foreground">:</span>
      {field.options ? (
        <select aria-label={field.label} className="h-9 min-w-0 border-0 bg-transparent px-2 uppercase outline-none focus:bg-primary/5 focus:ring-2 focus:ring-inset focus:ring-primary" value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">— PILIH —</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          ref={inputRef}
          aria-label={field.label}
          className="h-9 min-w-0 border-0 bg-transparent px-2 outline-none focus:bg-primary/5 focus:ring-2 focus:ring-inset focus:ring-primary"
          type={field.type ?? "text"}
          min={field.min}
          required={field.required}
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function SheetProductRow({
  label,
  value,
  onChange,
  options,
  type = "text",
  min,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  type?: "text" | "number";
  min?: number;
  required?: boolean;
}) {
  const listId = options ? "crm-product-options" : undefined;
  return (
    <label className="grid min-h-9 grid-cols-[118px_22px_minmax(0,1fr)] border-b text-xs">
      <span className="px-2 py-2 font-medium">{label}{required ? <span className="text-destructive"> *</span> : null}</span>
      <span className="border-x px-1 py-2 text-center text-muted-foreground">:</span>
      <span className="contents">
        <input aria-label={label} list={listId} type={type} min={min} required={required} className="h-9 min-w-0 border-0 bg-transparent px-2 outline-none focus:bg-primary/5 focus:ring-2 focus:ring-inset focus:ring-primary" value={value} onChange={(event) => onChange(event.target.value)} />
        {options ? <datalist id={listId}>{options.map((option) => <option key={option} value={upper(option)} />)}</datalist> : null}
      </span>
    </label>
  );
}

function SummaryRow({ label, value, negative = false }: { label: string; value: number; negative?: boolean }) {
  return <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3"><span>{label}</span><span className={negative && value ? "tabular text-destructive" : "tabular"}>{negative && value ? "-" : ""}{money(value)}</span></div>;
}

