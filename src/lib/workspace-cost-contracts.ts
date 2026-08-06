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
  proofUrl: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type WorkspaceCostBody = z.infer<typeof workspaceCostBodySchema>;

export const workspaceCostFilterSchema = z
  .object({
    from: dateKey.optional(),
    to: dateKey.optional(),
    category: z.enum(WORKSPACE_COST_CATEGORIES).optional(),
    status: z.enum(WORKSPACE_COST_STATUSES).optional(),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().min(1).max(200).default(50),
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
  amount: string;
  createdBy: number | null;
  createdByName: string | null;
  status: WorkspaceCostStatus;
  proofUrl: string | null;
};

export type WorkspaceCostDetail = WorkspaceCostRow & {
  usagePeriod: string | null;
  paymentMethod: string | null;
  referenceNumber: string | null;
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

export type WorkspaceCostKpi = {
  totalApproved: string;
  comBroadcast: string;
  comSoftwareTools: string;
  comAi: string;
  pendingApproval: number;
};

/** Aksi approval yang bisa dilakukan actor tertentu atas satu biaya —
 *  dihitung backend (docs prompt §9.4/9.6), UI hanya merender apa yang
 *  dikembalikan di sini. */
export type WorkspaceCostAction = "edit" | "submit" | "leader_verify" | "spv_approve" | "director_approve" | "request_revision" | "reject" | "cancel";
