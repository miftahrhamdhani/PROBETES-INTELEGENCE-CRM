import { z } from "zod";

export const MAX_CRM_REPORT_ITEMS = 5;

const moneyField = z.union([z.number(), z.string()]).transform((v) => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "") || 0) : v;
  return Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
});

const uppercaseText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value.toUpperCase());

export const crmReportItemSchema = z.object({
  productName: uppercaseText(255).pipe(z.string().min(1)),
  qty: z.union([z.number(), z.string()]).transform((v) => {
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) && n > 0 ? n : 1;
  }),
  productValue: moneyField,
  /** Catatan bebas per baris (mis. varian/warna/ukuran) — tidak memengaruhi Total Bayar. */
  itemNote: z.string().trim().max(255).optional().nullable(),
});
export type CrmReportItemBody = z.infer<typeof crmReportItemSchema>;

/** Template bisnis CRM Report — lihat CLAUDE.md untuk daftar field asal. */
export const crmReportSchema = z.object({
  customerName: uppercaseText(255).pipe(z.string().min(1)),
  phone: z.string().trim().min(5).max(30),
  address: uppercaseText(500).optional().nullable(),
  expedition: uppercaseText(120).optional().nullable(),
  memo: uppercaseText(500).optional().nullable(),
  paymentMethod: uppercaseText(120).optional().nullable(),
  items: z.array(crmReportItemSchema).min(1).max(MAX_CRM_REPORT_ITEMS),
  shippingCost: moneyField.optional(),
  packingCost: moneyField.optional(),
  discount: moneyField.optional(),
  adminCod: moneyField.optional(),
  totalPayment: moneyField.optional(),
  csName: uppercaseText(120).optional().nullable(),
  advName: uppercaseText(120).optional().nullable(),
  note: uppercaseText(2000).optional().nullable(),
  hub: uppercaseText(120).optional().nullable(),
  city: uppercaseText(120).optional().nullable(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD"),
  orderClosingCount: z.union([z.number(), z.string()]).optional().nullable(),
  salesType: uppercaseText(120).optional().nullable(),
  platform: uppercaseText(120).optional().nullable(),
  division: uppercaseText(120).optional().nullable(),
  dataReceivedCount: z.union([z.number(), z.string()]).optional().nullable(),
  crmVoucher: z.string().trim().max(120).optional().nullable(),
  codValue: moneyField.optional(),
  recipientDistrict: uppercaseText(120).optional().nullable(),
  recipientPostalCode: z.string().trim().max(20).optional().nullable(),
  partner: uppercaseText(120).optional().nullable(),
  crmMarketingCost: moneyField.optional(),
});
export type CrmReportBody = z.infer<typeof crmReportSchema>;

export type CrmReportListFilter = {
  search?: string;
  csName?: string;
  platform?: string;
  division?: string;
  salesType?: string;
  dateFrom?: string;
  dateTo?: string;
  includeArchived?: boolean;
  /** Filter Workspace > Laporan Kerja — hanya berlaku untuk laporan yang tertaut
   *  ke task (crm_reports.task_id), lihat src/server/crm-report/service.ts. */
  pic?: number;
  taskType?: string;
  taskStatus?: string;
  outcome?: string;
  page?: number;
  perPage?: number;
};
