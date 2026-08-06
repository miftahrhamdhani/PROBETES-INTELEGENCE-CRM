import type { QueryResult, QueryResultRow } from "@neondatabase/serverless";
import type { TransactionClient } from "@/server/db/transaction";

/**
 * Deteksi customer baru pasca-commit Database All — dipanggil dari
 * commitDatabaseAllImport (src/server/import/orchestrator.ts) di DALAM
 * transaction yang sama, supaya "import gagal/rollback -> task tidak pernah
 * dibuat" otomatis (bukan aturan terpisah yang bisa lupa dijaga).
 *
 * Idempoten lewat crm_tasks_new_customer_uq (unique partial index atas
 * customer_id WHERE task_type='FOLLOW_UP_NEW_CUSTOMER') — re-import file yang
 * sama tidak pernah menghasilkan file lain lolos initDatabaseAllImport's
 * fileHash guard, tapi index ini tetap jadi lapis pertahanan kedua kalau
 * proses ini pernah terpanggil dua kali untuk batch/customer yang sama.
 *
 * Basis deteksi: customers.first_seen_batch_id = batchId ini — kolom itu
 * HANYA di-set saat INSERT pertama kali (ON CONFLICT DO UPDATE di
 * bulkUpsertCustomers tidak menyentuhnya), jadi ini murni customer yang
 * benar-benar pertama kali muncul di batch ini, bukan customer repeat.
 */
export async function detectNewCustomersFromBatch(
  client: TransactionClient,
  batchId: number
): Promise<{ created: number }> {
  const result = await query<{ id: number }>(
    client,
    `INSERT INTO crm_tasks (customer_id, task_type, status, detected_from_batch_id, first_seen_at, created_at, updated_at)
     SELECT c.id, 'FOLLOW_UP_NEW_CUSTOMER', 'UNASSIGNED', $1, now(), now(), now()
     FROM customers c
     WHERE c.first_seen_batch_id = $1 AND c.name IS NOT NULL AND btrim(c.name) <> ''
       AND EXISTS (
         SELECT 1 FROM orders o
         WHERE o.customer_id = c.id AND o.source_batch_id = $1 AND o.is_crm_transaction = true
       )
     ON CONFLICT (customer_id) WHERE task_type = 'FOLLOW_UP_NEW_CUSTOMER' DO NOTHING
     RETURNING id`,
    [batchId]
  );
  return { created: result.rowCount ?? 0 };
}

async function query<T extends QueryResultRow = Record<string, unknown>>(
  client: TransactionClient,
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> {
  return client.query<T>(text, values);
}
