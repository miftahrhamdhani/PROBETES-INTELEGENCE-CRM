import { Client } from "@neondatabase/serverless";

async function main() {
  const client = new Client(process.env.DATABASE_URL!);
  await client.connect();
  await client.query("BEGIN");
  try {
    await client.query("ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS deleted_from_status crm_task_status");
    await client.query("ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz");
    await client.query("ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS deleted_by integer");

    const actor = await client.query<{ id: number }>("SELECT id FROM users WHERE active = true LIMIT 1");
    const actorId = actor.rows[0]?.id;
    const rows = await client.query<{ id: number; customer_id: number; status: string }>(
      "SELECT id::int AS id, customer_id, status FROM crm_tasks WHERE status <> 'CANCELLED' LIMIT 3 FOR UPDATE"
    );
    const ids = rows.rows.map((row) => row.id);
    if (!actorId || !ids.length) throw new Error("Tidak ada actor/task uji");

    const customerIds = rows.rows.map((row) => row.customer_id);
    const statuses = rows.rows.map((row) => row.status);
    await client.query(
      `UPDATE crm_tasks SET status = 'CANCELLED', deleted_from_status = status,
         deleted_at = now(), deleted_by = $2, updated_at = now()
       WHERE id = ANY($1::bigint[])`,
      [ids, actorId]
    );
    console.log(`TRASH -> OK rows=${ids.length}`);

    await client.query(
      `UPDATE crm_tasks AS task SET status = restored.status, deleted_from_status = NULL,
         deleted_at = NULL, deleted_by = NULL, updated_at = now()
       FROM unnest($1::bigint[], $2::crm_task_status[]) AS restored(id, status)
       WHERE task.id = restored.id`,
      [ids, statuses]
    );
    console.log(`RESTORE -> OK rows=${ids.length}`);

    await client.query(
      `UPDATE crm_tasks SET status = 'CANCELLED', deleted_from_status = status,
         deleted_at = now(), deleted_by = $2, updated_at = now()
       WHERE id = ANY($1::bigint[])`,
      [ids, actorId]
    );
    await client.query("UPDATE crm_reports SET task_id = NULL WHERE task_id = ANY($1::bigint[])", [ids]);
    const deleted = await client.query<{ id: number }>(
      "DELETE FROM crm_tasks WHERE id = ANY($1::bigint[]) AND status = 'CANCELLED' RETURNING id::int AS id",
      [ids]
    );
    const customers = await client.query<{ total: string }>(
      "SELECT count(*)::text AS total FROM customers WHERE id = ANY($1::int[])",
      [customerIds]
    );
    console.log(`PERMANENT DELETE -> OK task=${deleted.rows.length}; customer tetap=${customers.rows[0]?.total}`);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
    console.log("ROLLBACK -> data tidak berubah");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
