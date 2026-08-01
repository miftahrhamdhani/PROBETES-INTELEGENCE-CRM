import { z } from "zod";

export const MAX_CRM_REPORT_ITEMS = 5;

const moneyField = z.union([z.number(), z.string()]).transform((v) => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "") || 0) : v;
  return Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
});

export const crmReportItemSchema = z.object({
  productName: z.string().trim().min(1).max(255),
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
  customerName: z.string().trim().min(1).max(255),
  phone: z.string().trim().min(5).max(30),
  address: z.string().trim().max(500).optional().nullable(),
  expedition: z.string().trim().max(120).optional().nullable(),
  memo: z.string().trim().max(500).optional().nullable(),
  paymentMethod: z.string().trim().max(120).optional().nullable(),
  items: z.array(crmReportItemSchema).min(1).max(MAX_CRM_REPORT_ITEMS),
  shippingCost: moneyField.optional(),
  packingCost: moneyField.optional(),
  discount: moneyField.optional(),
  adminCod: moneyField.optional(),
  totalPayment: moneyField.optional(),
  csName: z.string().trim().max(120).optional().nullable(),
  advName: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
  hub: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD"),
  orderClosingCount: z.union([z.number(), z.string()]).optional().nullable(),
  salesType: z.string().trim().max(120).optional().nullable(),
  platform: z.string().trim().max(120).optional().nullable(),
  division: z.string().trim().max(120).optional().nullable(),
  dataReceivedCount: z.union([z.number(), z.string()]).optional().nullable(),
  crmVoucher: z.string().trim().max(120).optional().nullable(),
  codValue: moneyField.optional(),
  recipientDistrict: z.string().trim().max(120).optional().nullable(),
  recipientPostalCode: z.string().trim().max(20).optional().nullable(),
  partner: z.string().trim().max(120).optional().nullable(),
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
