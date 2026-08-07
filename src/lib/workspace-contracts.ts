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

/**
 * Tiga tahap kerja Pembagian Tugas — murni PENGELOMPOKAN status yang sudah ada,
 * bukan status baru di database:
 *
 *   Task      : belum punya PIC. Leader/SPV membagi ke CRM di sini.
 *   Broadcast : sudah punya PIC, sedang dikerjakan (broadcast berjalan).
 *   Completed : sudah selesai di-broadcast, lengkap dengan outcome + catatan.
 *
 * Task berpindah tab OTOMATIS mengikuti status: begitu di-assign, task pindah
 * dari Task ke Broadcast; begitu diselesaikan, pindah ke Completed. Task
 * Dibatalkan ("Hapus dari Pembagian Tugas") tidak muncul di tab mana pun.
 */
export const WORKSPACE_TASK_TABS = ["task", "broadcast", "completed", "trash"] as const;
export type WorkspaceTaskTab = (typeof WORKSPACE_TASK_TABS)[number];

export const WORKSPACE_TASK_TAB_LABELS: Record<WorkspaceTaskTab, string> = {
  task: "Task",
  broadcast: "Broadcast",
  completed: "Completed",
  trash: "Riwayat Hapus",
};

export const WORKSPACE_TASK_TAB_STATUSES: Record<WorkspaceTaskTab, readonly CrmTaskStatus[]> = {
  task: ["UNASSIGNED"],
  broadcast: ["ASSIGNED", "IN_PROGRESS"],
  completed: ["DONE"],
  trash: ["CANCELLED"],
};

/** Catatan customer pada task — bisa diperbarui kapan saja (mis. "masih
 *  negosiasi" lalu berubah jadi "sudah dibayar"), termasuk setelah task
 *  selesai. Dikosongkan = catatan dihapus. */
export const updateTaskNotesSchema = z.object({
  notes: z.string().trim().max(2000).nullable(),
});
export type UpdateTaskNotesBody = z.infer<typeof updateTaskNotesSchema>;

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

export const bulkTaskTypeSchema = z.object({
  taskIds: z.array(z.number().int().positive()).min(1).max(500),
  taskType: z.enum(MANUAL_CRM_TASK_TYPES),
});
export type BulkTaskTypeBody = z.infer<typeof bulkTaskTypeSchema>;

export const taskIdsSchema = z.object({
  taskIds: z.array(z.number().int().positive()).min(1).max(500),
});
export type TaskIdsBody = z.infer<typeof taskIdsSchema>;

/** Selesaikan banyak task sekaligus (Broadcast -> Completed). Outcome tetap
 *  WAJIB seperti completeTask satuan — satu outcome dipakai untuk semuanya. */
export const bulkCompleteSchema = z.object({
  taskIds: z.array(z.number().int().positive()).min(1).max(500),
  outcome: z.enum(CRM_TASK_OUTCOMES),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type BulkCompleteBody = z.infer<typeof bulkCompleteSchema>;

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
  /** Beberapa status sekaligus — dipakai tab "Broadcast" yang mencakup
   *  ASSIGNED + IN_PROGRESS. Digabung AND dengan `status` bila keduanya ada. */
  statuses?: CrmTaskStatus[];
  taskType?: CrmTaskType;
  outcome?: CrmTaskOutcome;
  dateFrom?: string;
  dateTo?: string;
  overdueOnly?: boolean;
  page?: number;
  perPage?: number;
};
