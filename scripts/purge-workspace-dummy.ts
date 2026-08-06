/**
 * Bersihkan data DUMMY Workspace CRM sebelum go-live.
 *
 * Yang DIHAPUS (hanya artefak test, bukan data bisnis):
 *  - workspace_orders yang customer_name-nya diawali "E2E TEST" (+ item-nya,
 *    ON DELETE CASCADE) — dibuat oleh e2e/pesanan-*.spec.ts
 *  - workspace_operational_costs hasil e2e/biaya-operasional.spec.ts, dikenali
 *    dari kombinasi TEPAT: kategori COM_LAINNYA + status CANCELLED + nominal
 *    Rp12.345 (nominal sentinel yang dipakai spec itu). Biaya asli TIDAK akan
 *    cocok dengan ketiganya sekaligus.
 *  - crm_audit_logs milik baris-baris di atas
 *
 * Yang TIDAK PERNAH disentuh: workspace_products (Master Data 26 produk),
 * workspace_cutover_log, users, dan seluruh tabel legacy (orders/customers/dst).
 *
 * Default DRY RUN — hanya mencetak rencana. Tambahkan `--confirm` untuk
 * benar-benar menghapus:
 *   npx tsx --env-file=.env scripts/purge-workspace-dummy.ts
 *   npx tsx --env-file=.env scripts/purge-workspace-dummy.ts --confirm
 */
import { Client } from "@neondatabase/serverless";

const CONFIRM = process.argv.includes("--confirm");

const DUMMY_ORDER_PREDICATE = `customer_name LIKE 'E2E TEST%'`;
// Sentinel e2e/biaya-operasional.spec.ts — ketiganya harus cocok sekaligus.
const DUMMY_COST_PREDICATE = `category = 'COM_LAINNYA' AND status = 'CANCELLED' AND amount = 12345`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diset.");

  const client = new Client(url);
  await client.connect();
  try {
    const orders = await client.query<{ id: string; order_number: string; customer_name: string }>(
      `SELECT id, order_number, customer_name FROM workspace_orders WHERE ${DUMMY_ORDER_PREDICATE} ORDER BY id`
    );
    const keptOrders = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM workspace_orders WHERE NOT (${DUMMY_ORDER_PREDICATE})`
    );
    const costs = await client.query<{ id: string; amount: string; status: string }>(
      `SELECT id, amount::text, status::text FROM workspace_operational_costs WHERE ${DUMMY_COST_PREDICATE} ORDER BY id`
    );
    const keptCosts = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM workspace_operational_costs WHERE NOT (${DUMMY_COST_PREDICATE})`
    );
    const products = await client.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM workspace_products`);

    const orderIds = orders.rows.map((r) => String(r.id));

    console.log("=== RENCANA PEMBERSIHAN DATA DUMMY WORKSPACE ===");
    console.log(`Pesanan dummy (E2E TEST) yang akan dihapus : ${orders.rows.length}`);
    for (const row of orders.rows) console.log(`   - ${row.order_number}  ${row.customer_name}`);
    console.log(`Biaya operasional dummy yang akan dihapus  : ${costs.rows.length}`);
    console.log("");
    console.log("--- TIDAK disentuh ---");
    console.log(`Pesanan asli (dipertahankan)               : ${keptOrders.rows[0]?.c ?? "0"}`);
    console.log(`Biaya operasional asli (dipertahankan)     : ${keptCosts.rows[0]?.c ?? "0"}`);
    console.log(`Master Data produk (dipertahankan)         : ${products.rows[0]?.c ?? "0"}`);
    console.log("");

    if (orders.rows.length === 0 && costs.rows.length === 0) {
      console.log("Tidak ada data dummy tersisa — tidak ada yang dihapus.");
      return;
    }

    if (!CONFIRM) {
      console.log("DRY RUN — tidak ada yang dihapus.");
      console.log("Jalankan ulang dengan --confirm untuk benar-benar menghapus.");
      return;
    }

    await client.query("BEGIN");
    try {
      let auditOrders = 0;
      if (orderIds.length > 0) {
        const res = await client.query(
          `DELETE FROM crm_audit_logs WHERE entity_type = 'WORKSPACE_ORDER' AND entity_id = ANY($1::text[])`,
          [orderIds]
        );
        auditOrders = res.rowCount ?? 0;
      }
      const costIds = costs.rows.map((r) => String(r.id));
      let auditCosts = 0;
      if (costIds.length > 0) {
        const res = await client.query(
          `DELETE FROM crm_audit_logs WHERE entity_type LIKE '%COST%' AND entity_id = ANY($1::text[])`,
          [costIds]
        );
        auditCosts = res.rowCount ?? 0;
      }
      // workspace_order_items ikut terhapus lewat ON DELETE CASCADE.
      const deletedOrders = await client.query(`DELETE FROM workspace_orders WHERE ${DUMMY_ORDER_PREDICATE}`);
      const deletedCosts = await client.query(`DELETE FROM workspace_operational_costs WHERE ${DUMMY_COST_PREDICATE}`);
      await client.query("COMMIT");

      console.log("=== SELESAI ===");
      console.log(`audit log pesanan dihapus : ${auditOrders}`);
      console.log(`audit log biaya dihapus   : ${auditCosts}`);
      console.log(`pesanan dihapus           : ${deletedOrders.rowCount ?? 0} (item ikut via CASCADE)`);
      console.log(`biaya operasional dihapus : ${deletedCosts.rowCount ?? 0}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("GAGAL:", error instanceof Error ? error.message : error);
  process.exit(1);
});
