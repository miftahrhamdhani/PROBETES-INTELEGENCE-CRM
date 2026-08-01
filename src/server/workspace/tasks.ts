import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withTransaction, type TransactionClient } from "@/server/db/transaction";
import { recalculateClusterForCustomer } from "@/server/import/orchestrator";
import {
  canTransitionStatus,
  type CrmTaskStatus,
  type WorkspaceTaskListFilter,
} from "@/lib/workspace-contracts";
import type {
  CustomerTaskHistoryRow,
  WorkspaceTaskDetail,
  WorkspaceTaskListResult,
  WorkspaceTaskRow,
} from "@/lib/workspace-types";

export class TaskNotFoundError extends Error {}
export class InvalidTransitionError extends Error {}

const DEFAULT_PER_PAGE = 60;
const MAX_PER_PAGE = 200;

const TASK_ROW_SELECT = sql`
  t.id, t.customer_id, cu.name AS customer_name, cu.normalized_phone AS customer_phone,
  r.first_order_date::text AS first_order_date,
  (
    SELECT p.name FROM orders o2
    JOIN order_items oi2 ON oi2.order_id = o2.id
    JOIN products p ON p.id = oi2.product_id
    WHERE o2.customer_id = t.customer_id
    ORDER BY o2.order_date ASC, o2.id ASC, oi2.id ASC
    LIMIT 1
  ) AS first_product_name,
  cc.cluster_code,
  COALESCE(gm.status, 'NOT_GROUPED') AS membership_status,
  t.task_type, t.status, t.outcome,
  t.assigned_to AS pic_user_id, pic.name AS pic_name,
  t.assigned_at::text AS assigned_at, t.due_at::text AS due_at,
  t.completed_at::text AS completed_at, t.notes,
  (t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE AND t.status NOT IN ('DONE','CANCELLED')) AS overdue,
  t.created_at::text AS created_at
`;

const TASK_ROW_FROM = sql`
  FROM crm_tasks t
  JOIN customers cu ON cu.id = t.customer_id
  LEFT JOIN customer_rfm_current r ON r.customer_id = t.customer_id
  LEFT JOIN customer_cluster_current cc ON cc.customer_id = t.customer_id
  LEFT JOIN customer_group_memberships gm ON gm.customer_id = t.customer_id
  LEFT JOIN users pic ON pic.id = t.assigned_to
`;

type TaskRowDb = {
  id: number;
  customer_id: number;
  customer_name: string | null;
  customer_phone: string;
  first_order_date: string | null;
  first_product_name: string | null;
  cluster_code: string | null;
  membership_status: WorkspaceTaskRow["membershipStatus"];
  task_type: WorkspaceTaskRow["taskType"];
  status: WorkspaceTaskRow["status"];
  outcome: WorkspaceTaskRow["outcome"];
  pic_user_id: number | null;
  pic_name: string | null;
  assigned_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  notes: string | null;
  overdue: boolean;
  created_at: string;
};

function toRow(row: TaskRowDb): WorkspaceTaskRow {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name?.trim() || "(tanpa nama)",
    customerPhone: row.customer_phone,
    firstOrderDate: row.first_order_date,
    firstProductName: row.first_product_name,
    clusterCode: row.cluster_code as WorkspaceTaskRow["clusterCode"],
    membershipStatus: row.membership_status,
    taskType: row.task_type,
    status: row.status,
    outcome: row.outcome,
    picUserId: row.pic_user_id,
    picName: row.pic_name,
    assignedAt: row.assigned_at,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    notes: row.notes,
    overdue: row.overdue,
    createdAt: row.created_at,
  };
}

function buildConditions(filter: WorkspaceTaskListFilter): SQL[] {
  const conditions: SQL[] = [];

  const search = filter.search?.trim();
  if (search) {
    const digits = search.replace(/\D+/g, "");
    conditions.push(
      digits.length >= 3
        ? sql`(cu.name ILIKE ${"%" + search + "%"} OR cu.normalized_phone LIKE ${"%" + digits + "%"})`
        : sql`cu.name ILIKE ${"%" + search + "%"}`
    );
  }

  if (filter.pic === "UNASSIGNED") {
    conditions.push(sql`t.assigned_to IS NULL`);
  } else if (typeof filter.pic === "number") {
    conditions.push(sql`t.assigned_to = ${filter.pic}`);
  }

  if (filter.status) conditions.push(sql`t.status = ${filter.status}`);
  if (filter.taskType) conditions.push(sql`t.task_type = ${filter.taskType}`);
  if (filter.outcome) conditions.push(sql`t.outcome = ${filter.outcome}`);
  if (filter.dateFrom) conditions.push(sql`t.due_at >= ${filter.dateFrom}::date`);
  if (filter.dateTo) conditions.push(sql`t.due_at <= ${filter.dateTo}::date`);
  if (filter.overdueOnly) {
    conditions.push(sql`t.due_at IS NOT NULL AND t.due_at < CURRENT_DATE AND t.status NOT IN ('DONE','CANCELLED')`);
  }

  return conditions.length ? conditions : [sql`true`];
}

function andAll(conditions: SQL[]): SQL {
  return conditions.reduce((acc, condition, index) => (index === 0 ? condition : sql`${acc} AND ${condition}`));
}

export async function listWorkspaceTasks(filter: WorkspaceTaskListFilter): Promise<WorkspaceTaskListResult> {
  const perPage = Math.min(Math.max(filter.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const page = Math.max(filter.page ?? 1, 1);
  const offset = (page - 1) * perPage;
  const where = andAll(buildConditions(filter));
  const db = getDb();

  const [rows, totals] = await Promise.all([
    db.execute<TaskRowDb>(sql`
      SELECT ${TASK_ROW_SELECT}
      ${TASK_ROW_FROM}
      WHERE ${where}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT ${perPage} OFFSET ${offset}
    `),
    db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::text AS total ${TASK_ROW_FROM} WHERE ${where}
    `),
  ]);

  return {
    rows: rows.rows.map(toRow),
    total: Number(totals.rows[0]?.total ?? 0),
    page,
    perPage,
  };
}

export async function getWorkspaceTaskDetail(taskId: number): Promise<WorkspaceTaskDetail | null> {
  const db = getDb();
  const [rowResult, extraResult, reportResult, historyResult] = await Promise.all([
    db.execute<TaskRowDb>(sql`SELECT ${TASK_ROW_SELECT} ${TASK_ROW_FROM} WHERE t.id = ${taskId}`),
    db.execute<{ assigned_by_name: string | null; completed_by_name: string | null }>(sql`
      SELECT ab.name AS assigned_by_name, cb.name AS completed_by_name
      FROM crm_tasks t
      LEFT JOIN users ab ON ab.id = t.assigned_by
      LEFT JOIN users cb ON cb.id = t.completed_by
      WHERE t.id = ${taskId}
    `),
    db.execute<{ id: number; report_date: string; total_payment: string; items_summary: string | null }>(sql`
      SELECT r.id, r.report_date::text AS report_date, r.total_payment::text AS total_payment,
        (SELECT string_agg(i.product_name || ' x' || i.qty, ', ' ORDER BY i.line_no) FROM crm_report_items i WHERE i.crm_report_id = r.id) AS items_summary
      FROM crm_reports r
      WHERE r.task_id = ${taskId}
      LIMIT 1
    `),
    db.execute<{
      id: number;
      from_status: CrmTaskStatus | null;
      to_status: CrmTaskStatus;
      note: string | null;
      changed_by_name: string | null;
      changed_at: string;
    }>(sql`
      SELECT h.id, h.from_status, h.to_status, h.note, u.name AS changed_by_name, h.changed_at::text AS changed_at
      FROM crm_task_history h
      LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.task_id = ${taskId}
      ORDER BY h.changed_at DESC
    `),
  ]);

  const row = rowResult.rows[0];
  if (!row) return null;
  const extra = extraResult.rows[0];
  const report = reportResult.rows[0];

  return {
    ...toRow(row),
    assignedByName: extra?.assigned_by_name ?? null,
    completedByName: extra?.completed_by_name ?? null,
    linkedReport: report
      ? { id: report.id, reportDate: report.report_date, totalPayment: report.total_payment, itemsSummary: report.items_summary ?? "—" }
      : null,
    history: historyResult.rows.map(
      (h): WorkspaceTaskDetail["history"][number] => ({
        id: h.id,
        fromStatus: h.from_status,
        toStatus: h.to_status,
        note: h.note,
        changedByName: h.changed_by_name,
        changedAt: h.changed_at,
      })
    ),
  };
}

/** "Riwayat CRM" di Customer Detail Sheet — semua task customer ini, terbaru dulu. */
export async function listCustomerTaskHistory(customerId: number): Promise<CustomerTaskHistoryRow[]> {
  const result = await getDb().execute<{
    id: number;
    task_type: CustomerTaskHistoryRow["taskType"];
    status: CustomerTaskHistoryRow["status"];
    outcome: CustomerTaskHistoryRow["outcome"];
    pic_name: string | null;
    due_at: string | null;
    completed_at: string | null;
    notes: string | null;
    created_at: string;
  }>(sql`
    SELECT t.id, t.task_type, t.status, t.outcome, pic.name AS pic_name,
      t.due_at::text AS due_at, t.completed_at::text AS completed_at, t.notes, t.created_at::text AS created_at
    FROM crm_tasks t
    LEFT JOIN users pic ON pic.id = t.assigned_to
    WHERE t.customer_id = ${customerId}
    ORDER BY t.created_at DESC, t.id DESC
  `);
  return result.rows.map((row) => ({
    id: row.id,
    taskType: row.task_type,
    status: row.status,
    outcome: row.outcome,
    picName: row.pic_name,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    notes: row.notes,
    createdAt: row.created_at,
  }));
}

async function insertHistory(
  client: TransactionClient,
  taskId: number,
  fromStatus: CrmTaskStatus | null,
  toStatus: CrmTaskStatus,
  changedBy: number,
  note?: string | null
): Promise<void> {
  await client.query(
    `INSERT INTO crm_task_history (task_id, from_status, to_status, note, changed_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [taskId, fromStatus, toStatus, note ?? null, changedBy]
  );
}

/** Assign satu task — kalau statusnya masih UNASSIGNED otomatis naik ke
 *  ASSIGNED; kalau sudah ASSIGNED/IN_PROGRESS ini murni re-assign PIC (status
 *  tidak berubah). DONE/CANCELLED tidak bisa di-assign ulang. */
export async function assignTask(
  taskId: number,
  input: { assignedTo: number; dueAt?: string | null },
  actorUserId: number
): Promise<void> {
  await withTransaction(async (client) => {
    const current = await client.query<{ status: CrmTaskStatus }>(
      "SELECT status FROM crm_tasks WHERE id = $1 FOR UPDATE",
      [taskId]
    );
    const row = current.rows[0];
    if (!row) throw new TaskNotFoundError();
    if (row.status === "DONE" || row.status === "CANCELLED") {
      throw new InvalidTransitionError(`Task berstatus ${row.status} tidak bisa di-assign`);
    }
    const nextStatus: CrmTaskStatus = row.status === "UNASSIGNED" ? "ASSIGNED" : row.status;

    await client.query(
      `UPDATE crm_tasks SET
         assigned_to = $2, assigned_by = $3, assigned_at = now(), status = $4,
         due_at = COALESCE($5::date, due_at), updated_at = now()
       WHERE id = $1`,
      [taskId, input.assignedTo, actorUserId, nextStatus, input.dueAt ?? null]
    );

    if (nextStatus !== row.status) {
      await insertHistory(client, taskId, row.status, nextStatus, actorUserId, "Assigned");
    }
  });
}

/** Bulk assign — set-based (satu UPDATE + satu bulk history insert), bukan
 *  loop per-row, supaya aman dipakai untuk ratusan task sekaligus. */
export async function bulkAssignTasks(
  taskIds: number[],
  input: { assignedTo: number; dueAt?: string | null },
  actorUserId: number
): Promise<{ updated: number; skipped: number }> {
  return withTransaction(async (client) => {
    const before = await client.query<{ id: number; status: CrmTaskStatus }>(
      "SELECT id, status FROM crm_tasks WHERE id = ANY($1::bigint[])",
      [taskIds]
    );
    const eligible = before.rows.filter((r) => r.status !== "DONE" && r.status !== "CANCELLED");
    if (eligible.length === 0) return { updated: 0, skipped: before.rows.length };

    const eligibleIds = eligible.map((r) => r.id);
    await client.query(
      `UPDATE crm_tasks SET
         assigned_to = $2, assigned_by = $3, assigned_at = now(),
         status = CASE WHEN status = 'UNASSIGNED' THEN 'ASSIGNED' ELSE status END,
         due_at = COALESCE($4::date, due_at), updated_at = now()
       WHERE id = ANY($1::bigint[])`,
      [eligibleIds, input.assignedTo, actorUserId, input.dueAt ?? null]
    );

    const toAssign = eligible.filter((r) => r.status === "UNASSIGNED");
    if (toAssign.length) {
      await client.query(
        `INSERT INTO crm_task_history (task_id, from_status, to_status, note, changed_by)
         SELECT id, 'UNASSIGNED'::crm_task_status, 'ASSIGNED'::crm_task_status, 'Bulk assign', $2
         FROM unnest($1::bigint[]) AS t(id)`,
        [toAssign.map((r) => r.id), actorUserId]
      );
    }

    return { updated: eligible.length, skipped: before.rows.length - eligible.length };
  });
}

/** Ubah status satu task lewat aksi manual (bukan penyelesaian — DONE hanya
 *  lewat completeTask). Validasi transisi: lib/workspace-contracts.ts. */
export async function setTaskStatus(
  taskId: number,
  status: Exclude<CrmTaskStatus, "DONE">,
  actorUserId: number,
  note?: string | null
): Promise<void> {
  await withTransaction(async (client) => {
    const current = await client.query<{ status: CrmTaskStatus }>(
      "SELECT status FROM crm_tasks WHERE id = $1 FOR UPDATE",
      [taskId]
    );
    const row = current.rows[0];
    if (!row) throw new TaskNotFoundError();
    if (!canTransitionStatus(row.status, status)) {
      throw new InvalidTransitionError(`Tidak bisa pindah dari ${row.status} ke ${status}`);
    }
    if (row.status === status) return;

    await client.query("UPDATE crm_tasks SET status = $2, updated_at = now() WHERE id = $1", [taskId, status]);
    await insertHistory(client, taskId, row.status, status, actorUserId, note);
  });
}

/** Bulk status — hanya target ASSIGNED/IN_PROGRESS/CANCELLED (DONE wajib lewat
 *  completeTask). Validasi per-row pakai canTransitionStatus di TS, lalu satu
 *  UPDATE set-based untuk subset yang valid + satu bulk history insert. */
export async function bulkSetTaskStatus(
  taskIds: number[],
  status: Exclude<CrmTaskStatus, "DONE">,
  actorUserId: number
): Promise<{ updated: number; skipped: number }> {
  return withTransaction(async (client) => {
    const before = await client.query<{ id: number; status: CrmTaskStatus }>(
      "SELECT id, status FROM crm_tasks WHERE id = ANY($1::bigint[])",
      [taskIds]
    );
    const eligible = before.rows.filter((r) => r.status !== status && canTransitionStatus(r.status, status));
    if (eligible.length === 0) return { updated: 0, skipped: before.rows.length };

    const eligibleIds = eligible.map((r) => r.id);
    const fromStatuses = eligible.map((r) => r.status);

    await client.query("UPDATE crm_tasks SET status = $2, updated_at = now() WHERE id = ANY($1::bigint[])", [
      eligibleIds,
      status,
    ]);
    // Snapshot `before` (bukan re-select setelah UPDATE) dipakai untuk from_status
    // supaya benar walau baris sudah berubah — array id & status sejajar (unnest 2 array).
    await client.query(
      `INSERT INTO crm_task_history (task_id, from_status, to_status, note, changed_by)
       SELECT id, from_status, $3::crm_task_status, 'Bulk status', $4
       FROM unnest($1::bigint[], $2::crm_task_status[]) AS t(id, from_status)`,
      [eligibleIds, fromStatuses, status, actorUserId]
    );

    return { updated: eligible.length, skipped: before.rows.length - eligible.length };
  });
}

/** Selesaikan task — satu-satunya jalur menuju DONE, wajib outcome. Kalau
 *  linkedReportId diisi, tautkan laporan CRM tsb ke task ini (crm_reports.task_id) —
 *  hanya kalau laporan belum tertaut ke task lain. */
export async function completeTask(
  taskId: number,
  input: { outcome: string; notes?: string | null; linkedReportId?: number | null },
  actorUserId: number
): Promise<void> {
  await withTransaction(async (client) => {
    const current = await client.query<{ status: CrmTaskStatus }>(
      "SELECT status FROM crm_tasks WHERE id = $1 FOR UPDATE",
      [taskId]
    );
    const row = current.rows[0];
    if (!row) throw new TaskNotFoundError();
    if (row.status !== "ASSIGNED" && row.status !== "IN_PROGRESS") {
      throw new InvalidTransitionError(`Task berstatus ${row.status} tidak bisa diselesaikan`);
    }

    await client.query(
      `UPDATE crm_tasks SET
         status = 'DONE', outcome = $2, notes = COALESCE($3, notes),
         completed_at = now(), completed_by = $4, updated_at = now()
       WHERE id = $1`,
      [taskId, input.outcome, input.notes ?? null, actorUserId]
    );
    await insertHistory(client, taskId, row.status, "DONE", actorUserId, `Outcome: ${input.outcome}`);

    if (input.linkedReportId) {
      await client.query(
        "UPDATE crm_reports SET task_id = $2, updated_at = now() WHERE id = $1 AND task_id IS NULL",
        [input.linkedReportId, taskId]
      );
    }
  });
}

export async function cancelTask(taskId: number, actorUserId: number, note?: string | null): Promise<void> {
  await setTaskStatus(taskId, "CANCELLED", actorUserId, note ?? "Dibatalkan");
}

export async function setTaskDueDate(taskId: number, dueAt: string | null, actorUserId: number): Promise<void> {
  const result = await getDb().execute(sql`
    UPDATE crm_tasks SET due_at = ${dueAt}::date, updated_at = now() WHERE id = ${taskId} RETURNING id
  `);
  if (!result.rows[0]) throw new TaskNotFoundError();
  void actorUserId;
}

export async function createManualTask(
  input: { customerId: number; taskType: string; dueAt?: string | null; notes?: string | null },
  actorUserId: number
): Promise<{ id: number }> {
  const result = await getDb().execute<{ id: number }>(sql`
    INSERT INTO crm_tasks (customer_id, task_type, status, due_at, notes, created_at, updated_at)
    VALUES (${input.customerId}, ${input.taskType}, 'UNASSIGNED', ${input.dueAt ?? null}::date, ${input.notes ?? null}, now(), now())
    RETURNING id
  `);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Gagal membuat task");
  void actorUserId;
  return { id };
}

/**
 * Konfirmasi outcome JOINED_GROUP -> update Group Membership jadi GROUPED.
 * TIDAK otomatis — dipanggil eksplisit setelah CRM klik konfirmasi (lihat
 * src/app/workspace-actions.ts). Rekalkulasi cluster memakai fungsi yang
 * sama persis dengan src/server/membership/service.ts supaya tidak ada
 * logic ganda antara Customer detail dan Workspace.
 */
export async function confirmJoinedGroupFromTask(
  taskId: number,
  input: { groupName: string | null; joinedAt: string | null; notes: string | null },
  actorUserId: number
): Promise<{ clusterCode: string | null }> {
  return withTransaction(async (client) => {
    const task = await client.query<{ customer_id: number; outcome: string | null }>(
      "SELECT customer_id, outcome FROM crm_tasks WHERE id = $1",
      [taskId]
    );
    const row = task.rows[0];
    if (!row) throw new TaskNotFoundError();

    const existing = await client.query<{ status: string }>(
      "SELECT status FROM customer_group_memberships WHERE customer_id = $1",
      [row.customer_id]
    );
    const oldStatus = existing.rows[0]?.status ?? null;

    await client.query(
      `INSERT INTO customer_group_memberships
         (customer_id, status, group_name, joined_at, notes, source, updated_at, updated_by)
       VALUES ($1, 'GROUPED', $2, $3, $4, 'CRM_MANUAL', now(), $5)
       ON CONFLICT (customer_id) DO UPDATE SET
         status = 'GROUPED', group_name = EXCLUDED.group_name, joined_at = EXCLUDED.joined_at,
         notes = EXCLUDED.notes, source = 'CRM_MANUAL', updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [row.customer_id, input.groupName, input.joinedAt, input.notes, actorUserId]
    );
    await client.query(
      `INSERT INTO customer_group_membership_history (customer_id, old_status, new_status, source, changed_by)
       VALUES ($1, $2, 'GROUPED', 'CRM_MANUAL', $3)`,
      [row.customer_id, oldStatus, actorUserId]
    );

    const recalculated = await recalculateClusterForCustomer(client, row.customer_id);
    return { clusterCode: recalculated?.clusterCode ?? null };
  });
}
