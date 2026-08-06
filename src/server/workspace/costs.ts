import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withTransaction, type TransactionClient } from "@/server/db/transaction";
import type {
  WorkspaceCostBody,
  WorkspaceCostCategory,
  WorkspaceCostDetail,
  WorkspaceCostFilter,
  WorkspaceCostKpi,
  WorkspaceCostRow,
  WorkspaceCostStatus,
} from "@/lib/workspace-cost-contracts";
import {
  CANCELLABLE_STATUSES,
  canCreateCost,
  nextApprovalStage,
  requiredApproverRole,
  resolveCostRole,
  stageResultStatus,
} from "@/lib/workspace-cost-workflow";

export class WorkspaceCostNotFoundError extends Error {}
export class WorkspaceCostForbiddenError extends Error {}
export class WorkspaceCostStateError extends Error {}

function andAll(conditions: SQL[]): SQL {
  return conditions.reduce((acc, condition, index) => (index === 0 ? condition : sql`${acc} AND ${condition}`));
}

function buildConditions(filter: WorkspaceCostFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.from) conditions.push(sql`c.cost_date >= ${filter.from}::date`);
  if (filter.to) conditions.push(sql`c.cost_date <= ${filter.to}::date`);
  if (filter.category) conditions.push(sql`c.category = ${filter.category}::workspace_cost_category`);
  if (filter.status) conditions.push(sql`c.status = ${filter.status}::workspace_cost_status`);
  if (filter.search?.trim()) conditions.push(sql`c.cost_name ILIKE ${"%" + filter.search.trim() + "%"}`);
  return conditions;
}

export async function listWorkspaceCosts(filter: WorkspaceCostFilter): Promise<{ rows: WorkspaceCostRow[]; total: number }> {
  const conditions = buildConditions(filter);
  const where = conditions.length ? andAll(conditions) : sql`true`;
  const perPage = filter.perPage;
  const offset = (filter.page - 1) * perPage;
  // Count terpisah (bukan `COUNT(*) OVER()`) — lihat catatan di
  // listWorkspaceOrders: window count jadi 0 saat halaman di luar rentang.
  const [result, countResult] = await Promise.all([
    getDb().execute<{
      id: number;
      cost_date: string;
      cost_name: string;
      category: WorkspaceCostCategory;
      vendor: string | null;
      amount: string;
      created_by: number | null;
      created_by_name: string | null;
      status: WorkspaceCostStatus;
      proof_url: string | null;
    }>(sql`
    SELECT c.id::int AS id, c.cost_date::text, c.cost_name, c.category::text AS category, c.vendor, c.amount::text,
      c.created_by, creator.name AS created_by_name, c.status::text AS status, c.proof_url
    FROM workspace_operational_costs c LEFT JOIN users creator ON creator.id = c.created_by
    WHERE ${where}
    ORDER BY c.cost_date DESC, c.id DESC
    LIMIT ${perPage} OFFSET ${offset}
  `),
    getDb().execute<{ total: string }>(sql`SELECT COUNT(*)::text AS total FROM workspace_operational_costs c WHERE ${where}`),
  ]);
  return {
    rows: result.rows.map((row) => ({
      id: row.id,
      costDate: row.cost_date,
      costName: row.cost_name,
      category: row.category,
      vendor: row.vendor,
      amount: row.amount,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      status: row.status,
      proofUrl: row.proof_url,
    })),
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

export async function getWorkspaceCostKpi(filter: WorkspaceCostFilter): Promise<WorkspaceCostKpi> {
  const conditions = buildConditions({ ...filter, status: undefined });
  const where = conditions.length ? andAll(conditions) : sql`true`;
  const result = await getDb().execute<{
    total_approved: string;
    com_broadcast: string;
    com_software_tools: string;
    com_ai: string;
    pending_approval: string;
  }>(sql`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE status = 'DIRECTOR_APPROVED'), 0)::text AS total_approved,
      COALESCE(SUM(amount) FILTER (WHERE status = 'DIRECTOR_APPROVED' AND category = 'BROADCAST'), 0)::text AS com_broadcast,
      COALESCE(SUM(amount) FILTER (WHERE status = 'DIRECTOR_APPROVED' AND category IN ('SOFTWARE_CRM','MEKARI_QONTAK')), 0)::text AS com_software_tools,
      COALESCE(SUM(amount) FILTER (WHERE status = 'DIRECTOR_APPROVED' AND category = 'AI_CRM'), 0)::text AS com_ai,
      COUNT(*) FILTER (WHERE status IN ('SUBMITTED','LEADER_VERIFIED','SPV_APPROVED'))::text AS pending_approval
    FROM workspace_operational_costs c WHERE ${where}
  `);
  const row = result.rows[0];
  return {
    totalApproved: row?.total_approved ?? "0",
    comBroadcast: row?.com_broadcast ?? "0",
    comSoftwareTools: row?.com_software_tools ?? "0",
    comAi: row?.com_ai ?? "0",
    pendingApproval: Number(row?.pending_approval ?? 0),
  };
}

/** COM Overview/Pesanan (§4.4) — hanya DIRECTOR_APPROVED dalam rentang tanggal aktif. */
export async function getApprovedComForPeriod(from?: string, to?: string): Promise<bigint> {
  const conditions: SQL[] = [sql`status = 'DIRECTOR_APPROVED'`];
  if (from) conditions.push(sql`cost_date >= ${from}::date`);
  if (to) conditions.push(sql`cost_date <= ${to}::date`);
  const result = await getDb().execute<{ total: string }>(
    sql`SELECT COALESCE(SUM(amount), 0)::text AS total FROM workspace_operational_costs WHERE ${andAll(conditions)}`
  );
  return BigInt(result.rows[0]?.total ?? "0");
}

export async function getWorkspaceCost(id: number): Promise<WorkspaceCostDetail | null> {
  const result = await getDb().execute<Record<string, unknown>>(sql`
    SELECT c.*, creator.name AS created_by_name, lv.name AS leader_verified_by_name,
      spv.name AS spv_approved_by_name, dir.name AS director_approved_by_name
    FROM workspace_operational_costs c
    LEFT JOIN users creator ON creator.id = c.created_by
    LEFT JOIN users lv ON lv.id = c.leader_verified_by
    LEFT JOIN users spv ON spv.id = c.spv_approved_by
    LEFT JOIN users dir ON dir.id = c.director_approved_by
    WHERE c.id = ${id}
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    costDate: String(row.cost_date),
    costName: String(row.cost_name),
    category: row.category as WorkspaceCostCategory,
    vendor: (row.vendor as string) ?? null,
    amount: String(row.amount),
    createdBy: row.created_by != null ? Number(row.created_by) : null,
    createdByName: (row.created_by_name as string) ?? null,
    status: row.status as WorkspaceCostStatus,
    proofUrl: (row.proof_url as string) ?? null,
    usagePeriod: (row.usage_period as string) ?? null,
    paymentMethod: (row.payment_method as string) ?? null,
    referenceNumber: (row.reference_number as string) ?? null,
    notes: (row.notes as string) ?? null,
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
    leaderVerifiedByName: (row.leader_verified_by_name as string) ?? null,
    leaderVerifiedAt: row.leader_verified_at ? String(row.leader_verified_at) : null,
    spvApprovedByName: (row.spv_approved_by_name as string) ?? null,
    spvApprovedAt: row.spv_approved_at ? String(row.spv_approved_at) : null,
    directorApprovedByName: (row.director_approved_by_name as string) ?? null,
    directorApprovedAt: row.director_approved_at ? String(row.director_approved_at) : null,
    revisionReason: (row.revision_reason as string) ?? null,
    rejectReason: (row.reject_reason as string) ?? null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function createWorkspaceCost(body: WorkspaceCostBody, actorId: number, actorName: string): Promise<number> {
  if (!canCreateCost(resolveCostRole(actorName))) {
    throw new WorkspaceCostForbiddenError("Hanya Leader CRM, SPV, atau Direktur yang boleh membuat pengajuan Biaya Operasional");
  }
  return withTransaction(async (client) => {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO workspace_operational_costs
        (cost_date, cost_name, amount, category, vendor, usage_period, payment_method, reference_number, proof_url, notes, status, created_by)
       VALUES ($1,$2,$3,$4::workspace_cost_category,$5,$6,$7,$8,$9,$10,'DRAFT',$11) RETURNING id::int AS id`,
      [body.costDate, body.costName, body.amount, body.category, body.vendor ?? null, body.usagePeriod ?? null, body.paymentMethod ?? null, body.referenceNumber ?? null, body.proofUrl ?? null, body.notes ?? null, actorId]
    );
    const id = inserted.rows[0]!.id;
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, after_value)
       VALUES ($1, 'COST_CREATE', 'WORKSPACE_COST', $2, $3::jsonb)`,
      [actorId, String(id), JSON.stringify(body)]
    );
    return id;
  });
}

async function loadCostForUpdate(client: TransactionClient, id: number) {
  const result = await client.query<{ id: number; status: WorkspaceCostStatus; created_by: number; created_by_name: string | null }>(
    `SELECT c.id, c.status, c.created_by, u.name AS created_by_name
     FROM workspace_operational_costs c LEFT JOIN users u ON u.id = c.created_by
     WHERE c.id = $1 FOR UPDATE OF c`,
    [id]
  );
  const row = result.rows[0];
  if (!row) throw new WorkspaceCostNotFoundError();
  return row;
}

export async function updateWorkspaceCostDraft(id: number, body: WorkspaceCostBody, actorId: number): Promise<void> {
  await withTransaction(async (client) => {
    const cost = await loadCostForUpdate(client, id);
    if (cost.created_by !== actorId) throw new WorkspaceCostForbiddenError("Hanya pembuat yang boleh mengedit pengajuan ini");
    if (cost.status !== "DRAFT" && cost.status !== "REVISION_REQUESTED") {
      throw new WorkspaceCostStateError("Hanya biaya berstatus DRAFT/REVISION_REQUESTED yang bisa diedit");
    }
    await client.query(
      `UPDATE workspace_operational_costs SET cost_date=$2, cost_name=$3, amount=$4, category=$5::workspace_cost_category,
        vendor=$6, usage_period=$7, payment_method=$8, reference_number=$9, proof_url=$10, notes=$11, updated_at=now()
       WHERE id=$1`,
      [id, body.costDate, body.costName, body.amount, body.category, body.vendor ?? null, body.usagePeriod ?? null, body.paymentMethod ?? null, body.referenceNumber ?? null, body.proofUrl ?? null, body.notes ?? null]
    );
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, after_value)
       VALUES ($1, 'COST_UPDATE', 'WORKSPACE_COST', $2, $3::jsonb)`,
      [actorId, String(id), JSON.stringify(body)]
    );
  });
}

export async function submitWorkspaceCost(id: number, actorId: number): Promise<void> {
  await withTransaction(async (client) => {
    const cost = await loadCostForUpdate(client, id);
    if (cost.created_by !== actorId) throw new WorkspaceCostForbiddenError("Hanya pembuat yang boleh mengajukan biaya ini");
    if (cost.status !== "DRAFT" && cost.status !== "REVISION_REQUESTED") {
      throw new WorkspaceCostStateError("Hanya biaya berstatus DRAFT/REVISION_REQUESTED yang bisa diajukan");
    }
    await client.query(`UPDATE workspace_operational_costs SET status='SUBMITTED', submitted_at=now(), updated_at=now() WHERE id=$1`, [id]);
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value)
       VALUES ($1, 'COST_SUBMIT', 'WORKSPACE_COST', $2, jsonb_build_object('status',$3::text), jsonb_build_object('status','SUBMITTED'))`,
      [actorId, String(id), cost.status]
    );
  });
}

export type CostDecision = "approve" | "revision" | "reject";

export async function decideWorkspaceCost(
  id: number,
  actorId: number,
  actorName: string,
  actorIsAdmin: boolean,
  decision: CostDecision,
  reason: string | null
): Promise<void> {
  if ((decision === "revision" || decision === "reject") && !reason?.trim()) {
    throw new WorkspaceCostStateError("Alasan wajib diisi untuk revisi/penolakan");
  }
  await withTransaction(async (client) => {
    const cost = await loadCostForUpdate(client, id);
    if (cost.created_by === actorId) {
      throw new WorkspaceCostForbiddenError("Pembuat tidak boleh melakukan self-approval atas pengajuannya sendiri");
    }
    const creatorRole = resolveCostRole(cost.created_by_name);
    const stage = nextApprovalStage(cost.status, creatorRole);
    if (!stage) throw new WorkspaceCostStateError(`Biaya berstatus ${cost.status} tidak punya tahap approval berikutnya`);

    const actorRole = resolveCostRole(actorName);
    const required = requiredApproverRole(stage);
    // ADMIN boleh bertindak di tahap manapun (override operasional/testing);
    // selain itu wajib nama yang cocok dengan role yang disyaratkan tahap ini.
    if (actorRole !== required && !actorIsAdmin) {
      throw new WorkspaceCostForbiddenError(`Tahap ini hanya boleh diputuskan oleh ${required === "LEADER" ? "Leader CRM" : required === "SPV" ? "SPV" : "Direktur"}`);
    }

    if (decision === "approve") {
      const resultStatus = stageResultStatus(stage);
      const column = stage === "LEADER_VERIFY" ? "leader_verified" : stage === "SPV_APPROVE" ? "spv_approved" : "director_approved";
      await client.query(
        `UPDATE workspace_operational_costs SET status=$2::workspace_cost_status, ${column}_by=$3, ${column}_at=now(), updated_at=now() WHERE id=$1`,
        [id, resultStatus, actorId]
      );
      await client.query(
        `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value)
         VALUES ($1, 'COST_APPROVE', 'WORKSPACE_COST', $2, jsonb_build_object('status',$3::text), jsonb_build_object('status',$4::text,'stage',$5::text))`,
        [actorId, String(id), cost.status, resultStatus, stage]
      );
    } else if (decision === "revision") {
      await client.query(
        `UPDATE workspace_operational_costs SET status='REVISION_REQUESTED', revision_reason=$2, updated_at=now() WHERE id=$1`,
        [id, reason]
      );
      await client.query(
        `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, reason)
         VALUES ($1, 'COST_REQUEST_REVISION', 'WORKSPACE_COST', $2, jsonb_build_object('status',$3::text), $4)`,
        [actorId, String(id), cost.status, reason]
      );
    } else {
      await client.query(`UPDATE workspace_operational_costs SET status='REJECTED', reject_reason=$2, updated_at=now() WHERE id=$1`, [id, reason]);
      await client.query(
        `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, reason)
         VALUES ($1, 'COST_REJECT', 'WORKSPACE_COST', $2, jsonb_build_object('status',$3::text), $4)`,
        [actorId, String(id), cost.status, reason]
      );
    }
  });
}

export async function cancelWorkspaceCost(id: number, actorId: number, actorIsAdmin: boolean, reason: string | null): Promise<void> {
  await withTransaction(async (client) => {
    const cost = await loadCostForUpdate(client, id);
    if (cost.created_by !== actorId && !actorIsAdmin) {
      throw new WorkspaceCostForbiddenError("Hanya pembuat atau admin yang boleh membatalkan biaya ini");
    }
    if (cost.status === "DIRECTOR_APPROVED" && !actorIsAdmin) {
      throw new WorkspaceCostForbiddenError("Biaya DIRECTOR_APPROVED hanya bisa dibatalkan oleh admin");
    }
    if (!CANCELLABLE_STATUSES.includes(cost.status) && cost.status !== "DIRECTOR_APPROVED") {
      throw new WorkspaceCostStateError(`Biaya berstatus ${cost.status} tidak bisa dibatalkan`);
    }
    await client.query(`UPDATE workspace_operational_costs SET status='CANCELLED', cancelled_at=now(), cancelled_by=$2, updated_at=now() WHERE id=$1`, [id, actorId]);
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, reason)
       VALUES ($1, 'COST_CANCEL', 'WORKSPACE_COST', $2, jsonb_build_object('status',$3::text), $4)`,
      [actorId, String(id), cost.status, reason]
    );
  });
}
