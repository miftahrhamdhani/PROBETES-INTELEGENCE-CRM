"use server";

import { requireRole } from "@/server/auth/guards";
import { listReportsForCustomer } from "@/server/crm-report/service";
import { getWorkspaceOverview, listAssignableCrmUsers } from "@/server/workspace/overview";
import {
  assignTask,
  bulkAssignTasks,
  bulkSetTaskStatus,
  cancelTask,
  completeTask,
  confirmJoinedGroupFromTask,
  createManualTask,
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
  createTaskSchema,
  setDueDateSchema,
  setStatusSchema,
  type WorkspaceTaskListFilter,
} from "@/lib/workspace-contracts";
import { WORKSPACE_TASK_LIST_CHUNK } from "@/lib/list-chunk";

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

export async function loadWorkspaceTaskList(filter: WorkspaceTaskListFilter) {
  await requireRole("ADMIN", "CRM");
  return listWorkspaceTasks(filter);
}

/** Dipakai infinite scroll (useInfiniteRows) — sama pola dengan loadCustomerListPage. */
export async function loadWorkspaceTaskListPage(
  filter: Omit<WorkspaceTaskListFilter, "page" | "perPage">,
  page: number
) {
  await requireRole("ADMIN", "CRM");
  return listWorkspaceTasks({ ...filter, page, perPage: WORKSPACE_TASK_LIST_CHUNK });
}

export async function loadWorkspaceTaskDetail(taskId: number) {
  await requireRole("ADMIN", "CRM");
  return getWorkspaceTaskDetail(taskId);
}

export async function loadCustomerTaskHistoryAction(customerId: number) {
  await requireRole("ADMIN", "CRM");
  return listCustomerTaskHistory(customerId);
}

export async function loadReportsForCustomerAction(customerId: number) {
  await requireRole("ADMIN", "CRM");
  return listReportsForCustomer(customerId);
}

export async function assignTaskAction(taskId: number, input: unknown): Promise<void> {
  const userId = await actor();
  const body = assignTaskSchema.parse(input);
  await assignTask(taskId, body, userId);
}

export async function bulkAssignTasksAction(input: unknown) {
  const userId = await actor();
  const body = bulkAssignSchema.parse(input);
  return bulkAssignTasks(body.taskIds, body, userId);
}

export async function setTaskStatusAction(taskId: number, input: unknown): Promise<void> {
  const userId = await actor();
  const body = setStatusSchema.parse(input);
  if (body.status === "DONE") throw new Error("Gunakan aksi 'Selesaikan Tugas' untuk status DONE");
  await setTaskStatus(taskId, body.status, userId, body.note);
}

export async function bulkSetTaskStatusAction(input: unknown) {
  const userId = await actor();
  const body = bulkStatusSchema.parse(input);
  return bulkSetTaskStatus(body.taskIds, body.status, userId);
}

export async function completeTaskAction(taskId: number, input: unknown): Promise<void> {
  const userId = await actor();
  const body = completeTaskSchema.parse(input);
  await completeTask(taskId, body, userId);
}

export async function cancelTaskAction(taskId: number, note?: string): Promise<void> {
  const userId = await actor();
  await cancelTask(taskId, userId, note ?? null);
}

export async function setTaskDueDateAction(taskId: number, input: unknown): Promise<void> {
  const userId = await actor();
  const body = setDueDateSchema.parse(input);
  await setTaskDueDate(taskId, body.dueAt, userId);
}

export async function createManualTaskAction(input: unknown): Promise<{ id: number }> {
  const userId = await actor();
  const body = createTaskSchema.parse(input);
  return createManualTask(body, userId);
}

/**
 * Konfirmasi outcome JOINED_GROUP -> Group Membership GROUPED. CRM wajib
 * klik konfirmasi eksplisit di dialog (tidak ada auto-update) — lihat
 * src/server/workspace/tasks.ts#confirmJoinedGroupFromTask untuk audit +
 * rekalkulasi cluster (memakai membership service yang sama dengan Customer detail).
 */
export async function confirmJoinedGroupAction(
  taskId: number,
  input: { groupName?: string | null; joinedAt?: string | null; notes?: string | null }
) {
  const userId = await actor();
  return confirmJoinedGroupFromTask(
    taskId,
    { groupName: input.groupName ?? null, joinedAt: input.joinedAt ?? null, notes: input.notes ?? null },
    userId
  );
}

