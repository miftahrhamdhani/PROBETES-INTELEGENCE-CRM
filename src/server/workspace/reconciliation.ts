import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withTransaction, type TransactionClient } from "@/server/db/transaction";

export class ReconciliationNotFoundError extends Error {}
export class InvalidReconciliationError extends Error {}

export async function findReconciliationCandidates(): Promise<number> {
  return withTransaction((client) => reconcileImportCandidates(client));
}

export async function reconcileImportCandidates(client: TransactionClient): Promise<number> {
    const result = await client.query<{ manual_id: number; official_id: number; candidate_count: number }>(
      `WITH manual_products AS (
         SELECT r.id,
           string_agg(upper(trim(i.product_name)) || ':' || i.qty::text, '|' ORDER BY upper(trim(i.product_name)), i.qty) AS products
         FROM crm_reports r JOIN crm_report_items i ON i.crm_report_id = r.id
         WHERE r.reconciliation_status IN ('PENDING','MATCH_CANDIDATE') AND r.archived_at IS NULL
         GROUP BY r.id
       ), official_products AS (
         SELECT o.id,
           string_agg(upper(trim(p.name)) || ':' || COALESCE(oi.qty, 1)::text, '|' ORDER BY upper(trim(p.name)), COALESCE(oi.qty, 1)) AS products
         FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id
         WHERE o.is_crm_transaction = true
         GROUP BY o.id
       ), candidates AS (
         SELECT r.id AS manual_id, o.id AS official_id,
           count(*) OVER (PARTITION BY r.id)::int AS candidate_count
         FROM crm_reports r
         JOIN manual_products mp ON mp.id = r.id
         JOIN orders o ON o.order_date = r.report_date
           AND o.customer_id = r.customer_id
           AND o.workspace_total = r.total_payment
           AND o.is_crm_transaction = true
         JOIN official_products op ON op.id = o.id AND op.products = mp.products
         WHERE r.reconciliation_status IN ('PENDING','MATCH_CANDIDATE') AND r.archived_at IS NULL
       ) SELECT manual_id, official_id::int, candidate_count FROM candidates`,
      []
    );
    if (!result.rows.length) return 0;

    for (const row of result.rows) {
      const status = row.candidate_count === 1 ? "RECONCILED" : "MATCH_CANDIDATE";
      await client.query(
        `INSERT INTO crm_reconciliations (manual_report_id, official_order_id, status, match_method, match_reason, reviewed_at)
         VALUES ($1, $2, $3::crm_reconciliation_status, 'EXACT_COMPOSITE', jsonb_build_object('candidateCount', $4), CASE WHEN $3 = 'RECONCILED' THEN now() END)
         ON CONFLICT (manual_report_id, official_order_id) DO UPDATE SET
           status = EXCLUDED.status, match_reason = EXCLUDED.match_reason`,
        [row.manual_id, row.official_id, status, row.candidate_count]
      );
      await client.query(
        "UPDATE crm_reports SET reconciliation_status = $2::crm_reconciliation_status, updated_at = now() WHERE id = $1",
        [row.manual_id, status]
      );
    }
    return new Set(result.rows.map((row) => row.manual_id)).size;
}

/**
 * Dipakai halaman /reconciliation lewat `loadReconciliationCandidatesAction`
 * (src/app/reconciliation-actions.ts) — antrean `MATCH_CANDIDATE` yang dibuat
 * `reconcileImportCandidates()` di atas kini punya jalur review operasional.
 */
export async function listReconciliationCandidates() {
  const result = await getDb().execute<{
    id: number;
    manual_report_id: number;
    official_order_id: number;
    customer_name: string;
    report_date: string;
    total_payment: string;
    status: string;
    match_method: string;
    match_reason: Record<string, unknown>;
  }>(sql`
    SELECT rc.id, rc.manual_report_id, rc.official_order_id, r.customer_name,
      r.report_date::text, r.total_payment::text, rc.status::text, rc.match_method, rc.match_reason
    FROM crm_reconciliations rc
    JOIN crm_reports r ON r.id = rc.manual_report_id
    WHERE rc.status = 'MATCH_CANDIDATE'
    ORDER BY rc.created_at DESC
  `);
  return result.rows;
}

export async function reviewReconciliation(
  reconciliationId: number,
  decision: "RECONCILED" | "REJECTED",
  actorUserId: number,
  reason: string
): Promise<void> {
  await withTransaction(async (client) => {
    const current = await client.query<{
      manual_report_id: number;
      official_order_id: number;
      status: string;
      match_reason: Record<string, unknown>;
    }>("SELECT manual_report_id, official_order_id, status, match_reason FROM crm_reconciliations WHERE id = $1 FOR UPDATE", [reconciliationId]);
    const row = current.rows[0];
    if (!row) throw new ReconciliationNotFoundError();
    if (row.status !== "MATCH_CANDIDATE") throw new InvalidReconciliationError("Kandidat sudah diproses");

    await client.query(
      `UPDATE crm_reconciliations SET status = $2::crm_reconciliation_status, reviewed_by = $3, reviewed_at = now(),
       match_reason = match_reason || jsonb_build_object('reviewReason', $4) WHERE id = $1`,
      [reconciliationId, decision, actorUserId, reason]
    );
    if (decision === "RECONCILED") {
      await client.query(
        "UPDATE crm_reports SET reconciliation_status = 'RECONCILED', updated_at = now() WHERE id = $1",
        [row.manual_report_id]
      );
    } else {
      const remaining = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM crm_reconciliations WHERE manual_report_id = $1 AND id <> $2 AND status = 'MATCH_CANDIDATE'",
        [row.manual_report_id, reconciliationId]
      );
      if (Number(remaining.rows[0]?.count ?? 0) === 0) {
        await client.query("UPDATE crm_reports SET reconciliation_status = 'REJECTED', updated_at = now() WHERE id = $1", [row.manual_report_id]);
      }
    }
    await client.query(
      `INSERT INTO crm_audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value, reason)
       VALUES ($1, $2, 'CRM_RECONCILIATION', $3, jsonb_build_object('status', $4), jsonb_build_object('status', $5), $6)`,
      [actorUserId, `RECONCILIATION_${decision}`, String(reconciliationId), row.status, decision, reason]
    );
  });
}
