import { z } from "zod";

export const WORKSPACE_COST_CATEGORIES = [
  "BROADCAST",
  "MEKARI_QONTAK",
  "WHATSAPP_API",
  "AI_CRM",
  "SOFTWARE_CRM",
  "CAMPAIGN_CRM",
  "DATABASE_LEADS",
  "SAMPLE_PROMOSI",
  "COM_LAINNYA",
] as const;
export type WorkspaceCostCategory = (typeof WORKSPACE_COST_CATEGORIES)[number];

export const WORKSPACE_COST_CATEGORY_LABEL: Record<WorkspaceCostCategory, string> = {
  BROADCAST: "Broadcast",
  MEKARI_QONTAK: "Mekari/Qontak",
  WHATSAPP_API: "WhatsApp API",
  AI_CRM: "AI CRM",
  SOFTWARE_CRM: "Software CRM",
  CAMPAIGN_CRM: "Campaign CRM",
  DATABASE_LEADS: "Database Leads",
  SAMPLE_PROMOSI: "Sampel Promosi",
  COM_LAINNYA: "COM Lainnya",
};

export const WORKSPACE_COST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "LEADER_VERIFIED",
  "SPV_APPROVED",
  "DIRECTOR_APPROVED",
  "REVISION_REQUESTED",
  "REJECTED",
  "CANCELLED",
] as const;
export type WorkspaceCostStatus = (typeof WORKSPACE_COST_STATUSES)[number];

export const WORKSPACE_COST_STATUS_LABEL: Record<WorkspaceCostStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  LEADER_VERIFIED: "Menunggu Persetujuan SPV",
  SPV_APPROVED: "Menunggu Persetujuan Direktur",
  DIRECTOR_APPROVED: "Disetujui Direktur",
  REVISION_REQUESTED: "Perlu Revisi",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

export const WORKSPACE_COST_SORTS = [
  "cost_date",
  "cost_name",
  "category",
  "vendor",
  "amount",
  "created_by_name",
  "status",
  "created_at",
  "updated_at",
] as const;
export type WorkspaceCostSort = (typeof WORKSPACE_COST_SORTS)[number];
export const WORKSPACE_COST_PAGE_SIZES = [10, 25, 50, 100] as const;

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const workspaceCostBodySchema = z.object({
  costDate: dateKey,
  costName: z.string().trim().min(1, "Nama Biaya wajib diisi").max(200),
  amount: z.coerce.number().int().positive("Nominal biaya harus lebih dari nol"),
  category: z.enum(WORKSPACE_COST_CATEGORIES),
  vendor: z.string().trim().max(200).optional().nullable(),
  usagePeriod: z.string().trim().max(120).optional().nullable(),
  paymentMethod: z.string().trim().max(60).optional().nullable(),
  referenceNumber: z.string().trim().max(120).optional().nullable(),
  // Hanya http(s) — mencegah javascript:/data:/file: dan protokol tidak aman
  // lain dipakai sebagai "bukti pembayaran" (docs prompt §16.4).
  proofUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .refine((value) => !value || /^https:\/\//i.test(value) || /^http:\/\//i.test(value), "Bukti pembayaran harus berupa tautan http/https"),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type WorkspaceCostBody = z.infer<typeof workspaceCostBodySchema>;

export const workspaceCostFilterSchema = z
  .object({
    from: dateKey.optional(),
    to: dateKey.optional(),
    category: z.enum(WORKSPACE_COST_CATEGORIES).optional(),
    status: z.enum(WORKSPACE_COST_STATUSES).optional(),
    // Mencari nama biaya, vendor, no. referensi, DAN periode penggunaan sekaligus
    // (docs prompt §6.4) — satu kolom search, bukan field terpisah per target.
    search: z.string().trim().max(200).optional(),
    sort: z.enum(WORKSPACE_COST_SORTS).default("cost_date"),
    order: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().min(1).max(200).default(10),
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tanggal awal tidak boleh melewati tanggal akhir" });
    }
  });
export type WorkspaceCostFilter = z.infer<typeof workspaceCostFilterSchema>;

export const workspaceCostDecisionSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
});
export type WorkspaceCostDecision = z.infer<typeof workspaceCostDecisionSchema>;

export type WorkspaceCostRow = {
  id: number;
  costDate: string;
  costName: string;
  category: WorkspaceCostCategory;
  vendor: string | null;
  usagePeriod: string | null;
  paymentMethod: string | null;
  referenceNumber: string | null;
  amount: string;
  createdBy: number | null;
  createdByName: string | null;
  status: WorkspaceCostStatus;
  proofUrl: string | null;
};

export type WorkspaceCostDetail = WorkspaceCostRow & {
  notes: string | null;
  submittedAt: string | null;
  leaderVerifiedByName: string | null;
  leaderVerifiedAt: string | null;
  spvApprovedByName: string | null;
  spvApprovedAt: string | null;
  directorApprovedByName: string | null;
  directorApprovedAt: string | null;
  revisionReason: string | null;
  rejectReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Aksi approval yang bisa dilakukan actor tertentu atas satu biaya —
 *  dihitung backend (docs prompt §9.4/9.6), UI hanya merender apa yang
 *  dikembalikan di sini. */
export type WorkspaceCostAction = "edit" | "submit" | "leader_verify" | "spv_approve" | "director_approve" | "request_revision" | "reject" | "cancel";
