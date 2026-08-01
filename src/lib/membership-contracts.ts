import { z } from "zod";

export const MEMBERSHIP_STATUSES = ["GROUPED", "NOT_GROUPED", "UNKNOWN"] as const;
export type MembershipStatusValue = (typeof MEMBERSHIP_STATUSES)[number];

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatusValue, string> = {
  GROUPED: "Sudah masuk grup",
  NOT_GROUPED: "Belum masuk grup",
  UNKNOWN: "Belum diputuskan",
};

export const updateMembershipSchema = z.object({
  status: z.enum(MEMBERSHIP_STATUSES),
  groupName: z.string().trim().max(255).nullable().optional(),
  joinedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  picUserId: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type UpdateMembershipBody = z.infer<typeof updateMembershipSchema>;
