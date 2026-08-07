import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { overdueCondition } from "@/server/workspace/date";
import type { CrmUserOption, WorkspaceOverview, WorkspacePicSummaryRow } from "@/lib/workspace-types";

const HAS_ACTIVE_DATASET = sql`
  EXISTS (SELECT 1 FROM import_batches b WHERE b.source_type = 'DATABASE_ALL' AND b.is_active = true)
`;

/** KPI ringkasan Workspace Overview — semua dihitung real-time dari crm_tasks/customers,
 *  tanpa mock. "Customer baru dari import terakhir" dihitung dari customers.first_seen_batch_id
 *  langsung (bukan dari crm_tasks) supaya tetap akurat walau task auto-create pernah gagal parsial. */
export async function getWorkspaceOverview(): Promise<WorkspaceOverview> {
  const db = getDb();
  const [kpiResult, picResult] = await Promise.all([
    db.execute<{
      new_customers: string;
      unassigned: string;
      assigned: string;
      in_progress: string;
      done: string;
      overdue: string;
      closing: string;
      joined_group: string;
      deleted: string;
    }>(sql`
      SELECT
        (SELECT COUNT(*) FROM customers c
          WHERE ${HAS_ACTIVE_DATASET} AND c.first_seen_batch_id = (
            SELECT id FROM import_batches WHERE source_type = 'DATABASE_ALL' AND is_active = true LIMIT 1
          ))::text AS new_customers,
        (SELECT COUNT(*) FROM crm_tasks WHERE status = 'UNASSIGNED')::text AS unassigned,
        (SELECT COUNT(*) FROM crm_tasks WHERE status = 'ASSIGNED')::text AS assigned,
        (SELECT COUNT(*) FROM crm_tasks WHERE status = 'IN_PROGRESS')::text AS in_progress,
        (SELECT COUNT(*) FROM crm_tasks WHERE status = 'DONE')::text AS done,
        (SELECT COUNT(*) FROM crm_tasks WHERE ${overdueCondition("crm_tasks")})::text AS overdue,
        (SELECT COUNT(*) FROM crm_tasks WHERE outcome = 'CLOSING')::text AS closing,
        (SELECT COUNT(*) FROM crm_tasks WHERE outcome = 'JOINED_GROUP')::text AS joined_group,
        (SELECT COUNT(*) FROM crm_tasks WHERE status = 'CANCELLED')::text AS deleted
    `),
    db.execute<{
      user_id: number;
      user_name: string;
      unassigned: string;
      assigned: string;
      in_progress: string;
      done: string;
      overdue: string;
      closing: string;
      joined_group: string;
      deleted: string;
      total: string;
    }>(sql`
      SELECT
        u.id AS user_id, u.name AS user_name,
        COUNT(*) FILTER (WHERE t.status = 'UNASSIGNED')::text AS unassigned,
        COUNT(*) FILTER (WHERE t.status = 'ASSIGNED')::text AS assigned,
        COUNT(*) FILTER (WHERE t.status = 'IN_PROGRESS')::text AS in_progress,
        COUNT(*) FILTER (WHERE t.status = 'DONE')::text AS done,
        COUNT(*) FILTER (WHERE ${overdueCondition("t")})::text AS overdue,
        COUNT(*) FILTER (WHERE t.outcome = 'CLOSING')::text AS closing,
        COUNT(*) FILTER (WHERE t.outcome = 'JOINED_GROUP')::text AS joined_group,
        COUNT(*) FILTER (WHERE t.status = 'CANCELLED')::text AS deleted,
        COUNT(*) FILTER (WHERE t.status <> 'CANCELLED')::text AS total
      FROM crm_tasks t
      JOIN users u ON u.id = t.assigned_to
      GROUP BY u.id, u.name
      ORDER BY COUNT(*) DESC, u.name
    `),
  ]);

  const kpiRow = kpiResult.rows[0];
  const picSummary: WorkspacePicSummaryRow[] = picResult.rows.map((row) => ({
    userId: row.user_id,
    userName: row.user_name,
    unassigned: Number(row.unassigned),
    assigned: Number(row.assigned),
    inProgress: Number(row.in_progress),
    done: Number(row.done),
    overdue: Number(row.overdue),
    closing: Number(row.closing),
    joinedGroup: Number(row.joined_group),
    deleted: Number(row.deleted),
    total: Number(row.total),
  }));

  return {
    kpi: {
      newCustomersLastImport: Number(kpiRow?.new_customers ?? 0),
      unassigned: Number(kpiRow?.unassigned ?? 0),
      assigned: Number(kpiRow?.assigned ?? 0),
      inProgress: Number(kpiRow?.in_progress ?? 0),
      done: Number(kpiRow?.done ?? 0),
      overdue: Number(kpiRow?.overdue ?? 0),
      closing: Number(kpiRow?.closing ?? 0),
      joinedGroup: Number(kpiRow?.joined_group ?? 0),
      deleted: Number(kpiRow?.deleted ?? 0),
    },
    picSummary,
  };
}

/** Daftar user ADMIN/CRM aktif untuk dropdown assign PIC — semua user role
 *  operasional, bukan cuma yang sudah pernah di-assign (beda dari listPics
 *  di analytics/customers.ts yang khusus PIC membership yang sudah terpakai). */
export async function listAssignableCrmUsers(): Promise<CrmUserOption[]> {
  const result = await getDb().execute<{ id: number; name: string }>(sql`
    SELECT id, name FROM users WHERE role IN ('ADMIN', 'CRM') AND active = true ORDER BY name
  `);
  return result.rows;
}
