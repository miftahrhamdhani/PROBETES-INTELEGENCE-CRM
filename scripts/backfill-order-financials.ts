/**
 * Backfill kolom finansial Workspace CRM (ongkir/packing/diskon/admin COD/COM/
 * kota/hub/sales_type) untuk order yang sudah ter-commit SEBELUM kolom ini
 * ditambahkan ke bulkUpsertOrders (src/server/import/orchestrator.ts).
 *
 * Root cause: migration 0013 hanya mem-backfill kolom identitas/klasifikasi
 * (fingerprint, is_crm_transaction) lewat SQL heuristic sederhana — kolom
 * finansial di atas tetap default 0/null untuk order lama, walau data
 * mentahnya (Ongkir/BiayaMarketingCRM/dst) memang ada di staging_import_rows.
 *
 * Sekali jalan, IDEMPOTEN, dry-run default (sama pola dengan backfill-ksb-drift.ts):
 *
 *   npm exec tsx --env-file=.env scripts/backfill-order-financials.ts            # dry-run
 *   npm exec tsx --env-file=.env scripts/backfill-order-financials.ts -- --apply # tulis
 *
 * Yang TIDAK disentuh: order_items, customer_rfm_current, customer_cluster_current,
 * cluster A1-F. Hanya UPDATE kolom finansial order-level yang sudah nol/null.
 */
import { Client } from "@neondatabase/serverless";
import { parseDatabaseAll } from "../src/server/import/database-all-parser";
import { loadApprovedAliasOverlayTx } from "../src/server/product/aliases";
import type { SourceRow } from "../src/server/import/types";

const APPLY = process.argv.includes("--apply");

const client = new Client(process.env.DATABASE_URL);
await client.connect();

function log(...args: unknown[]) {
  console.log(...args);
}

async function loadStagedRows(batchId: number): Promise<SourceRow[]> {
  const result = await client.query<{ row_number: number; raw_data: Record<string, unknown> }>(
    "SELECT row_number, raw_data FROM staging_import_rows WHERE import_batch_id = $1 ORDER BY row_number",
    [batchId]
  );
  return result.rows.map((row) => ({ rowNumber: row.row_number, values: row.raw_data }));
}

async function main() {
  const batches = await client.query<{ id: number; filename: string; total_rows: number }>(
    "SELECT id, filename, total_rows FROM import_batches WHERE source_type = 'DATABASE_ALL' AND status = 'COMPLETED' ORDER BY id"
  );
  log(`Batch DATABASE_ALL COMPLETED: ${batches.rows.length}`);

  let totalCandidates = 0;
  let totalUpdated = 0;

  for (const batch of batches.rows) {
    const rows = await loadStagedRows(batch.id);
    if (rows.length !== batch.total_rows) {
      log(`  [skip] batch ${batch.id} (${batch.filename}): staging ${rows.length}/${batch.total_rows} tidak lengkap`);
      continue;
    }
    const overlay = await loadApprovedAliasOverlayTx(client);
    const parsed = parseDatabaseAll(rows, overlay);
    log(`  batch ${batch.id} (${batch.filename}): ${parsed.orders.length} order diparse ulang`);

    const keys = parsed.orders.map((o) => o.sourceOrderKey);
    const shipping = parsed.orders.map((o) => o.shippingCost.toString());
    const packing = parsed.orders.map((o) => o.packingCost.toString());
    const discount = parsed.orders.map((o) => o.discount.toString());
    const adminCod = parsed.orders.map((o) => o.adminCod.toString());
    const com = parsed.orders.map((o) => o.crmMarketingCost.toString());
    const city = parsed.orders.map((o) => o.city || null);
    const hub = parsed.orders.map((o) => o.hub || null);
    const salesType = parsed.orders.map((o) => o.salesType || null);
    const workspaceTotal = parsed.orders.map((o) => (o.workspaceTotal > 0n ? o.workspaceTotal : o.orderTotal).toString());

    const candidates = await client.query<{ id: string }>(
      `SELECT o.id FROM orders o
       JOIN unnest($1::text[]) AS t(key) ON t.key = o.source_order_key
       WHERE o.source_batch_id = $2
         AND o.shipping_cost = 0 AND o.packing_cost = 0 AND o.discount = 0
         AND o.admin_cod = 0 AND o.crm_marketing_cost = 0
         AND o.city IS NULL AND o.hub IS NULL`,
      [keys, batch.id]
    );
    totalCandidates += candidates.rows.length;
    log(`    kandidat backfill (kolom finansial masih kosong): ${candidates.rows.length}`);

    if (!APPLY) continue;

    const result = await client.query(
      `UPDATE orders o SET
         shipping_cost = t.shipping::bigint, packing_cost = t.packing::bigint,
         discount = t.discount::bigint, admin_cod = t.admin_cod::bigint,
         crm_marketing_cost = t.com::bigint, workspace_total = t.workspace_total::bigint,
         city = t.city, hub = t.hub, sales_type = t.sales_type, updated_at = now()
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
         $7::text[], $8::text[], $9::text[], $10::text[])
         AS t(key, shipping, packing, discount, admin_cod, com, city, hub, sales_type, workspace_total)
       WHERE o.source_order_key = t.key AND o.source_batch_id = $11
         AND o.shipping_cost = 0 AND o.packing_cost = 0 AND o.discount = 0
         AND o.admin_cod = 0 AND o.crm_marketing_cost = 0
         AND o.city IS NULL AND o.hub IS NULL`,
      [keys, shipping, packing, discount, adminCod, com, city, hub, salesType, workspaceTotal, batch.id]
    );
    totalUpdated += result.rowCount ?? 0;
    log(`    diupdate: ${result.rowCount ?? 0}`);
  }

  log("");
  log(`TOTAL kandidat: ${totalCandidates}`);
  log(`TOTAL diupdate: ${APPLY ? totalUpdated : "0 (dry-run, jalankan dengan -- --apply untuk menulis)"}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
