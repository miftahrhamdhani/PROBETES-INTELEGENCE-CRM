import { sql } from "drizzle-orm";
import { getDb } from "../src/server/db/client";

const db = getDb();

const reasonArg = process.argv.slice(2).join(" ").trim();
const reason = reasonArg || "Fresh start implementasi Workspace CRM V1 — data pesanan lama (orders/crm_reports) tidak digunakan pada Workspace baru.";

const existing = await db.execute<{ id: number; cutover_at: string }>(sql`SELECT id, cutover_at::text FROM workspace_cutover_log ORDER BY cutover_at DESC LIMIT 1`);
if (existing.rows[0]) {
  console.log(`Cutover sudah pernah diinisialisasi pada ${existing.rows[0].cutover_at} (id=${existing.rows[0].id}). Tidak melakukan apa pun.`);
  process.exit(0);
}

const admin = await db.execute<{ id: number }>(sql`SELECT id FROM users WHERE role = 'ADMIN' AND active = true ORDER BY id LIMIT 1`);
const actorId = admin.rows[0]?.id ?? null;

const legacyOrders = await db.execute<{ count: string }>(sql`SELECT COUNT(*)::text AS count FROM orders`);
const legacyReports = await db.execute<{ count: string }>(sql`SELECT COUNT(*)::text AS count FROM crm_reports`);
const legacyExcludedCount = Number(legacyOrders.rows[0]?.count ?? 0) + Number(legacyReports.rows[0]?.count ?? 0);

const inserted = await db.execute<{ id: number; cutover_at: string }>(sql`
  INSERT INTO workspace_cutover_log (created_by, reason, legacy_excluded_count, notes)
  VALUES (${actorId}, ${reason}, ${legacyExcludedCount},
    'Dibuat otomatis oleh scripts/init-workspace-cutover.ts. legacy_excluded_count = jumlah baris orders + crm_reports yang ada saat cutover (bukan sumber Workspace baru).')
  RETURNING id, cutover_at::text
`);

console.log(`Workspace cutover diinisialisasi: id=${inserted.rows[0]?.id}, cutover_at=${inserted.rows[0]?.cutover_at}, legacy_excluded_count=${legacyExcludedCount}`);
