"use server";

import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import { revalidateAnalytics } from "@/server/analytics/cache";
import { listReportsForCustomer } from "@/server/workspace/customer-reports";
import { getWorkspaceOverview, listAssignableCrmUsers } from "@/server/workspace/overview";
import {
  assignTask,
  bulkAssignTasks,
  bulkSetTaskStatus,
  cancelTask,
  completeTask,
  confirmJoinedGroupFromTask,
  createManualTask,
  createManualTasksBulk,
  getWorkspaceTaskDetail,
  listCustomerTaskHistory,
  listWorkspaceTasks,
  setTaskDueDate,
  setTaskStatus,
} from "@/server/workspace/tasks";
import {
  assignTaskSchema,
  bulkAssignSchema,
  bulkStatusSchema,
  completeTaskSchema,
  confirmJoinedGroupSchema,
  createTaskSchema,
  createTasksBulkSchema,
  setDueDateSchema,
  setStatusSchema,
} from "@/lib/workspace-contracts";
import {
  idSchema,
  pageNumberSchema,
  workspaceTaskListFilterSchema,
} from "@/lib/list-filter-contracts";
import { WORKSPACE_TASK_LIST_CHUNK } from "@/lib/list-chunk";

/**
 * Workspace memuat PII customer (nama, No. HP) di baris task — seluruh action,
 * termasuk baca, dijaga `requireRole("ADMIN","CRM")` sesuai matriks
 * src/lib/roles.ts (/workspace = ADMIN, CRM). Parameter dari client selalu
 * divalidasi Zod: action id Next.js global sehingga argumennya tidak bisa
 * dipercaya dari tipe TypeScript saja.
 */
async function actor() {
  const user = await requireRole("ADMIN", "CRM");
  return Number(user.id);
}

export async function loadWorkspaceOverview() {
  await requireRole("ADMIN", "CRM");
  return getWorkspaceOverview();
}

export async function loadAssignableCrmUsers() {
  await requireRole("ADMIN", "CRM");
  return listAssignableCrmUsers();
}

export async function loadWorkspaceTaskList(filter: unknown) {
  await requireRole("ADMIN", "CRM");
  return listWorkspaceTasks(workspaceTaskListFilterSchema.parse(filter));
}

/** Dipakai infinite scroll (useInfiniteRows) — sama pola dengan loadCustomerListPage. */
export async function loadWorkspaceTaskListPage(filter: unknown, page: unknown) {
  await requireRole("ADMIN", "CRM");
  const parsed = workspaceTaskListFilterSchema.parse(filter);
  return listWorkspaceTasks({ ...parsed, page: pageNumberSchema.parse(page), perPage: WORKSPACE_TASK_LIST_CHUNK });
}

export async function loadWorkspaceTaskDetail(taskId: unknown) {
  await requireRole("ADMIN", "CRM");
  return getWorkspaceTaskDetail(idSchema.parse(taskId));
}

export async function loadCustomerTaskHistoryAction(customerId: unknown) {
  await requireRole("ADMIN", "CRM");
  return listCustomerTaskHistory(idSchema.parse(customerId));
}

export async function loadReportsForCustomerAction(customerId: unknown) {
  await requireRole("ADMIN", "CRM");
  return listReportsForCustomer(idSchema.parse(customerId));
}

export async function assignTaskAction(taskId: unknown, input: unknown): Promise<void> {
  const userId = await actor();
  const id = idSchema.parse(taskId);
  const body = assignTaskSchema.parse(input);
  await assignTask(id, body, userId);
}

export async function bulkAssignTasksAction(input: unknown) {
  const userId = await actor();
  const body = bulkAssignSchema.parse(input);
  return bulkAssignTasks(body.taskIds, body, userId);
}

export async function setTaskStatusAction(taskId: unknown, input: unknown): Promise<void> {
  const userId = await actor();
  const id = idSchema.parse(taskId);
  const body = setStatusSchema.parse(input);
  if (body.status === "DONE") throw new Error("Gunakan aksi 'Selesaikan Tugas' untuk status DONE");
  await setTaskStatus(id, body.status, userId, body.note);
}

export async function bulkSetTaskStatusAction(input: unknown) {
  const userId = await actor();
  const body = bulkStatusSchema.parse(input);
  return bulkSetTaskStatus(body.taskIds, body.status, userId);
}

export async function completeTaskAction(taskId: unknown, input: unknown): Promise<void> {
  const userId = await actor();
  const id = idSchema.parse(taskId);
  const body = completeTaskSchema.parse(input);
  await completeTask(id, body, userId);
}

export async function cancelTaskAction(taskId: unknown, note?: unknown): Promise<void> {
  const userId = await actor();
  const id = idSchema.parse(taskId);
  const parsedNote = z.string().trim().max(2000).nullable().optional().parse(note ?? null);
  await cancelTask(id, userId, parsedNote ?? null);
}

export async function setTaskDueDateAction(taskId: unknown, input: unknown): Promise<void> {
  const userId = await actor();
  const id = idSchema.parse(taskId);
  const body = setDueDateSchema.parse(input);
  await setTaskDueDate(id, body.dueAt, userId);
}

export async function createManualTaskAction(input: unknown): Promise<{ id: number }> {
  const userId = await actor();
  const body = createTaskSchema.parse(input);
  return createManualTask(body, userId);
}

/**
 * "Masukkan ke Pembagian Tugas" dari Customers/Customer Cluster — klik kanan
 * satu customer atau multi-select banyak sekaligus. Task lahir UNASSIGNED,
 * langsung terlihat leader di Pembagian Tugas untuk di-assign ke staff.
 */
export async function createManualTasksBulkAction(input: unknown): Promise<{ created: number }> {
  const userId = await actor();
  const body = createTasksBulkSchema.parse(input);
  return createManualTasksBulk(body, userId);
}

/**
 * Konfirmasi outcome JOINED_GROUP -> Group Membership GROUPED. CRM wajib
 * klik konfirmasi eksplisit di dialog (tidak ada auto-update) — lihat
 * src/server/workspace/tasks.ts#confirmJoinedGroupFromTask untuk audit +
 * rekalkulasi cluster (memakai membership service yang sama dengan Customer detail).
 */
export async function confirmJoinedGroupAction(taskId: unknown, input: unknown) {
  const userId = await actor();
  const id = idSchema.parse(taskId);
  const body = confirmJoinedGroupSchema.parse(input ?? {});
  const result = await confirmJoinedGroupFromTask(
    id,
    { groupName: body.groupName ?? null, joinedAt: body.joinedAt ?? null, notes: body.notes ?? null },
    userId
  );
  // Konfirmasi ini mengubah membership -> has_group -> cluster; agregat basi.
  revalidateAnalytics();
  return result;
}

