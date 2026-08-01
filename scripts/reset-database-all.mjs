/**
 * Kosongkan seluruh data Database All supaya file yang sama bisa diimport ulang
 * dari nol (untuk pengujian alur upload). Data ini sepenuhnya bisa dibangun
 * kembali dari file Excel sumber.
 *
 *   node scripts/reset-database-all.mjs --yes
 *
 * TIDAK disentuh: users (akun login), products & product_aliases (hasil seed).
 */
import { Client } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

if (!process.argv.includes("--yes")) {
  console.error(
    "Menghapus SEMUA customer/order/RFM/cluster/batch Database All.\n" +
      "Jalankan ulang dengan --yes kalau memang itu yang diinginkan:\n" +
      "  node scripts/reset-database-all.mjs --yes"
  );
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

// Urutan penting: anak dulu, induk terakhir (FK).
const TABLES = [
  "order_items",
  "orders",
  "customer_cluster_history",
  "customer_cluster_current",
  "customer_rfm_current",
  "data_quality_issues",
  "staging_import_rows",
  "customer_group_memberships",
  "ksb_transactions",
  "customers",
  "cs_agents",
  "import_batches",
];

const client = new Client(env.DATABASE_URL);
await client.connect();

async function counts(tables) {
  const out = [];
  for (const table of tables) {
    const result = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    out.push(`${table.padEnd(28)} ${result.rows[0].n}`);
  }
  return out.join("\n");
}

console.log("--- sebelum ---\n" + (await counts(TABLES)));

await client.query("BEGIN");
for (const table of TABLES) await client.query(`DELETE FROM ${table} WHERE true`);
await client.query("COMMIT");

console.log(
  "\n--- sesudah ---\n" + (await counts([...TABLES, "products", "product_aliases", "users"]))
);
console.log("\nSiap. Upload ulang file Database All lewat halaman /import.");

await client.end();
