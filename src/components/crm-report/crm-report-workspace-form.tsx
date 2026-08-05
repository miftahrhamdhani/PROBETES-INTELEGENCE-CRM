"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Calculator, CheckCircle2, Loader2, UserRound, Package } from "lucide-react";
import { toast } from "sonner";
import { createCrmReportAction, updateCrmReportAction } from "@/app/crm-reports-actions";
import { CrmReportManager } from "@/components/crm-report/crm-report-manager";
import { Button } from "@/components/ui/button";
import { calculateCrmReportTotals, parseCrmNumber } from "@/lib/crm-report-calculation";
import { MAX_CRM_REPORT_ITEMS } from "@/lib/crm-report-contracts";
import type { CrmReportDetail, CrmReportListResult, CrmReportRow } from "@/lib/crm-report-types";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

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
      if (intent === "save-new" && mode === "edit") {
        router.push("/workspace/input-kerja/baru");
        return;
      }
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
    <div className="space-y-3 text-slate-900">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Input Laporan CRM</h2>
          <p className="mt-1 text-xs text-slate-500">Catat informasi penjualan CRM secara lengkap dan ringkas.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-2 text-[11px] text-slate-500">Data per {formatReportDate(form.reportDate)}</span>
          {mode === "edit" ? <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={busy}>Batal</Button> : null}
          <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={busy}>Reset</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => handleSave("save-new")} disabled={busy}>
            {saving === "save-new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            Simpan &amp; Baru
          </Button>
          <Button type="button" size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => handleSave("save")} disabled={busy}>
            {saving === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            Simpan
          </Button>
        </div>
      </header>

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      {success ? (
        <p role="status" className="flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {success}
        </p>
      ) : null}

      <div
        ref={sheetRef}
        className="grid min-w-0 gap-2 xl:grid-cols-[0.95fr_1.05fr_1.12fr_0.88fr] xl:items-stretch"
        onKeyDown={handleWorksheetEnter}
      >
        <FormPanel title="Data Konsumen" icon={UserRound}>
          <div className="space-y-2 p-3">
            {customerFields.map((field) => (
              <CompactField
                key={field.key}
                field={field}
                value={String(form[field.key])}
                inputRef={field.key === "customerName" ? customerNameRef : undefined}
                onChange={(value) => updateField(field.key, (field.uppercase ? upper(value) : value) as never)}
              />
            ))}
          </div>
        </FormPanel>

        <FormPanel title="Detail Produk (1–5)" icon={Package}>
          <div className="p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_66px_92px] gap-2 border-b border-slate-100 pb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <span>Produk</span><span>QTY</span><span>Nilai Produk</span>
            </div>
            <div className="divide-y divide-slate-100">
              {form.items.map((item, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_66px_92px] gap-2 py-2">
                  <ProductInput
                    label={`Produk ${index + 1}`}
                    value={item.productName}
                    options={productNameOptions}
                    required={index === 0}
                    onChange={(value) => updateItem(index, { productName: upper(value) })}
                  />
                  <ProductInput label={`QTY ${index + 1}`} type="number" value={item.qty || "0"} min={0} onChange={(value) => updateItem(index, { qty: value })} />
                  <ProductInput label={`Nilai Produk ${index + 1}`} type="number" value={item.productValue || "0"} min={0} onChange={(value) => updateItem(index, { productValue: value })} />
                </div>
              ))}
            </div>
          </div>
        </FormPanel>

        <FormPanel title="Sales & Nilai" icon={BarChart3}>
          <div className="space-y-1.5 p-3">
            {salesFields.map((field) => (
              <CompactField
                key={field.key}
                field={field}
                value={String(form[field.key])}
                onChange={(value) => updateField(field.key, (field.uppercase ? upper(value) : value) as never)}
              />
            ))}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] font-semibold">
              <span>Total Bayar</span><span>{money(totalPayment)}</span>
            </div>
          </div>
        </FormPanel>

        <FormPanel title="Ringkasan Perhitungan" icon={Calculator}>
          <div className="flex h-full flex-col p-3">
            <div className="divide-y divide-slate-100 text-[11px]">
              <SummaryRow label="Total Nilai Produk" value={totalProductValue} />
              <SummaryRow label="Ongkir" value={parseCrmNumber(form.shippingCost)} />
              <SummaryRow label="Packing" value={parseCrmNumber(form.packingCost)} />
              <SummaryRow label="Diskon" value={parseCrmNumber(form.discount)} negative />
              <SummaryRow label="Admin COD" value={parseCrmNumber(form.adminCod)} />
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-4 border-t border-slate-200 px-1 py-4">
              <span className="text-sm font-bold uppercase">Total</span>
              <span className="text-2xl font-black text-blue-600">{money(totalPayment)}</span>
            </div>
          </div>
        </FormPanel>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_10px_30px_-28px_rgba(15,23,42,0.35)]">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Riwayat Input Laporan CRM</h2>
        </div>
        <div className="p-3">
          <CrmReportManager
            filter={{}}
            initialData={initialList}
            exportQuery=""
            previewRow={previewRow}
            reloadKey={listReloadKey}
            hideInputAction
            compactHistory
          />
        </div>
      </section>
    </div>
  );
}

function FormPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_10px_30px_-28px_rgba(15,23,42,0.4)]">
      <h2 className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 text-xs font-semibold">
        <Icon className="h-4 w-4 text-blue-600" aria-hidden="true" /> {title}
      </h2>
      {children}
    </section>
  );
}

function CompactField({
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
  const inputClass = "h-8 min-w-0 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
  return (
    <label className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-2 text-[11px]">
      <span className="font-medium text-slate-600">{field.label}{field.required ? <span className="text-red-500"> *</span> : null}</span>
      {field.options ? (
        <select aria-label={field.label} className={cn(inputClass, "uppercase")} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Pilih {field.label.toLocaleLowerCase("id-ID")}</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          ref={inputRef}
          aria-label={field.label}
          className={inputClass}
          type={field.type ?? "text"}
          min={field.min}
          required={field.required}
          value={value}
          placeholder={field.placeholder ?? `Masukkan ${field.label.toLocaleLowerCase("id-ID")}`}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function ProductInput({
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
    <>
      <input
        aria-label={label}
        list={listId}
        type={type}
        min={min}
        required={required}
        className="h-8 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        value={value}
        placeholder={type === "number" ? "0" : label}
        onChange={(event) => onChange(event.target.value)}
      />
      {options ? <datalist id={listId}>{options.map((option) => <option key={option} value={upper(option)} />)}</datalist> : null}
    </>
  );
}

function SummaryRow({ label, value, negative = false }: { label: string; value: number; negative?: boolean }) {
  return <div className="grid grid-cols-[1fr_auto] gap-4 px-1 py-3"><span className="text-slate-600">{label}</span><span className={negative && value ? "font-semibold text-red-600" : "font-semibold text-slate-700"}>{negative && value ? "-" : ""}{money(value)}</span></div>;
}

function formatReportDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

