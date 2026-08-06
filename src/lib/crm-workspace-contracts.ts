import { z } from "zod";

export const BUSINESS_TIME_ZONE = "Asia/Jakarta";
export const CRM_MAPPING_VERSION = "v1";
export const CRM_TRANSACTION_STATUSES = [
  "CONFIRMED",
  "CANCELLED",
  "COD_FAILED",
  "RETURNED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "ADJUSTED",
] as const;
export type CrmTransactionStatus = (typeof CRM_TRANSACTION_STATUSES)[number];
export const CRM_SOURCE_LAYERS = ["OFFICIAL", "PROVISIONAL", "ALL"] as const;
export type CrmSourceLayer = (typeof CRM_SOURCE_LAYERS)[number];

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = z.string().trim().max(255).optional();

export const crmWorkspaceFilterSchema = z
  .object({
    from: dateKey.optional(),
    to: dateKey.optional(),
    sourceLayer: z.enum(CRM_SOURCE_LAYERS).default("OFFICIAL"),
    cs: optionalText,
    productId: z.coerce.number().int().positive().optional(),
    salesType: optionalText,
    hub: optionalText,
    paymentMethod: optionalText,
    city: optionalText,
    status: z.enum(CRM_TRANSACTION_STATUSES).optional(),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().min(1).max(200).default(60),
  })
  .superRefine((value, ctx) => {
    if ((value.from && !value.to) || (!value.from && value.to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tanggal from dan to wajib berpasangan" });
    }
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tanggal awal tidak boleh melewati tanggal akhir" });
    }
  });

export type CrmWorkspaceFilter = z.infer<typeof crmWorkspaceFilterSchema>;

export type MetricValue = {
  value: string | null;
  available: boolean;
  reason: string | null;
};

export type CrmFinancialKpi = {
  leads: MetricValue;
  closing: MetricValue;
  conversionRate: MetricValue;
  revenue: MetricValue;
  cos: MetricValue;
  com: MetricValue;
  aov: MetricValue;
  margin: MetricValue;
  marginPercent: MetricValue;
  hppCoveragePercent: string;
  unknownHppOrders: number;
};

export type CrmTrendPoint = {
  period: string;
  revenue: string;
  cos: string;
  com: string;
  margin: string | null;
  marginComplete: boolean;
};

export type CrmDimensionMetric = {
  key: string;
  label: string;
  closing: number;
  quantity: string;
  revenue: string;
  cos: string;
  com: string;
  margin: string | null;
  marginComplete: boolean;
};

export type CrmDataQuality = {
  unknownHppOrders: number;
  marginIncomplete: boolean;
  leadBatchIdentityIssues: number;
  leadFilterIncompatible: boolean;
  unattributedCsOrders: number;
  reconciliationPending: number;
  unclassifiedRows: number;
  crmMappingVersion: string;
};

export type CrmOverview = {
  filter: CrmWorkspaceFilter;
  kpi: CrmFinancialKpi;
  trend: CrmTrendPoint[];
  csPerformance: CrmDimensionMetric[];
  productsByQuantity: CrmDimensionMetric[];
  productsByRevenue: CrmDimensionMetric[];
  productsByMargin: CrmDimensionMetric[];
  hubs: CrmDimensionMetric[];
  cities: CrmDimensionMetric[];
  salesTypes: CrmDimensionMetric[];
  paymentMethods: CrmDimensionMetric[];
  quality: CrmDataQuality;
  provisional: { pendingOrders: number; value: string };
};
