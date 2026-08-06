import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";

export type EntityAuditLogRow = {
  id: number;
  actorName: string | null;
  action: string;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
};

/** Audit generik (docs prompt §12) — dipakai Pesanan/Master Data/Biaya
 *  Operasional lewat satu tabel `crm_audit_logs`, difilter per entity. */
export async function listEntityAuditLog(entityType: string, entityId: string | number, limit = 50): Promise<EntityAuditLogRow[]> {
  const result = await getDb().execute<{
    id: number;
    actor_name: string | null;
    action: string;
    before_value: Record<string, unknown> | null;
    after_value: Record<string, unknown> | null;
    reason: string | null;
    created_at: string;
  }>(sql`
    SELECT a.id, u.name AS actor_name, a.action, a.before_value, a.after_value, a.reason, a.created_at::text
    FROM crm_audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE a.entity_type = ${entityType} AND a.entity_id = ${String(entityId)}
    ORDER BY a.created_at DESC LIMIT ${limit}
  `);
  return result.rows.map((row) => ({
    id: Number(row.id),
    actorName: row.actor_name,
    action: row.action,
    beforeValue: row.before_value,
    afterValue: row.after_value,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}
