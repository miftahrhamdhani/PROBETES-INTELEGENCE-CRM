/**
 * SHARED — konstanta, label, validasi Zod, dan aturan transisi status Workspace.
 * Tanpa I/O, tanpa React — supaya aturan transisi bisa di-unit-test tanpa DB.
 */
import { z } from "zod";

export const CRM_TASK_TYPES = [
  "FOLLOW_UP_NEW_CUSTOMER",
  "FOLLOW_UP_REPEAT",
  "BROADCAST",
  "INVITE_GROUP",
  "OTHER",
] as const;
export type CrmTaskType = (typeof CRM_TASK_TYPES)[number];

export const CRM_TASK_TYPE_LABELS: Record<CrmTaskType, string> = {
  FOLLOW_UP_NEW_CUSTOMER: "Follow-up Customer Baru",
  FOLLOW_UP_REPEAT: "Follow-up Ulang",
  BROADCAST: "Broadcast",
  INVITE_GROUP: "Invite Group",
  OTHER: "Lainnya",
};

export const MANUAL_CRM_TASK_TYPES = ["FOLLOW_UP_REPEAT", "BROADCAST", "INVITE_GROUP", "OTHER"] as const;
export type ManualCrmTaskType = (typeof MANUAL_CRM_TASK_TYPES)[number];

export const CRM_TASK_STATUSES = ["UNASSIGNED", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type CrmTaskStatus = (typeof CRM_TASK_STATUSES)[number];

export const CRM_TASK_STATUS_LABELS: Record<CrmTaskStatus, string> = {
  UNASSIGNED: "Belum Dibagi",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  DONE: "Selesai",
  CANCELLED: "Dibatalkan",
};

export const CRM_TASK_OUTCOMES = [
  "NO_RESPONSE",
  "CONTACTED",
  "INTERESTED",
  "NOT_INTERESTED",
  "JOINED_GROUP",
  "CLOSING",
  "FOLLOW_UP_AGAIN",
  "OTHER",
] as const;
export type CrmTaskOutcome = (typeof CRM_TASK_OUTCOMES)[number];

export const CRM_TASK_OUTCOME_LABELS: Record<CrmTaskOutcome, string> = {
  NO_RESPONSE: "Tidak Ada Respon",
  CONTACTED: "Sudah Dihubungi",
  INTERESTED: "Tertarik",
  NOT_INTERESTED: "Tidak Tertarik",
  JOINED_GROUP: "Masuk Grup",
  CLOSING: "Closing",
  FOLLOW_UP_AGAIN: "Follow-up Lagi",
  OTHER: "Lainnya",
};

/**
 * Transisi status yang diizinkan lewat aksi manual CRM (assign/set-status/complete).
 * FIRST-CLASS RULE: DONE hanya lewat aksi "selesaikan tugas" (wajib outcome),
 * bukan lewat set-status generik — lihat completeTaskSchema. Peta ini dipakai
 * baik untuk assign/set-status manual maupun bulk status.
 */
const MANUAL_STATUS_TRANSITIONS: Record<CrmTaskStatus, readonly CrmTaskStatus[]> = {
  UNASSIGNED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "UNASSIGNED", "CANCELLED"],
  IN_PROGRESS: ["ASSIGNED", "DONE", "CANCELLED"],
  DONE: [],
  CANCELLED: ["UNASSIGNED"],
};

export function canTransitionStatus(from: CrmTaskStatus, to: CrmTaskStatus): boolean {
  if (from === to) return true;
  return MANUAL_STATUS_TRANSITIONS[from].includes(to);
}

/** Status yang boleh dipakai di "Bulk Status". DONE wajib lewat completeTask;
 *  ASSIGNED wajib lewat assign agar task selalu punya PIC valid. */
export const BULK_STATUS_TARGETS = ["UNASSIGNED", "ASSIGNED", "IN_PROGRESS", "CANCELLED"] as const;

export const assignTaskSchema = z.object({
  assignedTo: z.number().int().positive(),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});
export type AssignTaskBody = z.infer<typeof assignTaskSchema>;

export const bulkAssignSchema = z.object({
  taskIds: z.array(z.number().int().positive()).min(1).max(500),
  assignedTo: z.number().int().positive(),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});
export type BulkAssignBody = z.infer<typeof bulkAssignSchema>;

export const setStatusSchema = z.object({
  status: z.enum(CRM_TASK_STATUSES),
  note: z.string().trim().max(500).nullable().optional(),
});
export type SetStatusBody = z.infer<typeof setStatusSchema>;

export const bulkStatusSchema = z.object({
  taskIds: z.array(z.number().int().positive()).min(1).max(500),
  status: z.enum(BULK_STATUS_TARGETS),
});
export type BulkStatusBody = z.infer<typeof bulkStatusSchema>;

export const completeTaskSchema = z.object({
  outcome: z.enum(CRM_TASK_OUTCOMES),
  notes: z.string().trim().max(2000).nullable().optional(),
  linkedReportId: z.number().int().positive().nullable().optional(),
});
export type CompleteTaskBody = z.infer<typeof completeTaskSchema>;

/** Konfirmasi JOINED_GROUP -> membership GROUPED. Bentuk field sengaja sama
 *  dengan updateMembershipSchema (src/lib/membership-contracts.ts) karena
 *  keduanya bermuara ke service membership yang sama. */
export const confirmJoinedGroupSchema = z.object({
  groupName: z.string().trim().max(255).nullable().optional(),
  joinedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD")
    .nullable()
    .optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const setDueDateSchema = z.object({
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});
export type SetDueDateBody = z.infer<typeof setDueDateSchema>;

export const createTaskSchema = z.object({
  customerId: z.number().int().positive(),
  taskType: z.enum(MANUAL_CRM_TASK_TYPES),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type CreateTaskBody = z.infer<typeof createTaskSchema>;

/** "Masukkan ke Pembagian Tugas" dari Customers/Customer Cluster (klik kanan
 *  atau multi-select) — satu atau banyak customer sekaligus, task sama untuk
 *  semuanya. Dipakai createManualTasksBulkAction. */
export const createTasksBulkSchema = z.object({
  customerIds: z.array(z.number().int().positive()).min(1).max(200),
  taskType: z.enum(MANUAL_CRM_TASK_TYPES),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type CreateTasksBulkBody = z.infer<typeof createTasksBulkSchema>;

export type WorkspaceTaskListFilter = {
  search?: string;
  pic?: number | "UNASSIGNED";
  status?: CrmTaskStatus;
  taskType?: CrmTaskType;
  outcome?: CrmTaskOutcome;
  dateFrom?: string;
  dateTo?: string;
  overdueOnly?: boolean;
  page?: number;
  perPage?: number;
};
