/**
 * Backfill SEKALI-JALAN: Legacy KSB (CSV/xlsx export DataKSB) -> ksb_transactions.
 * Bukan workflow upload rutin (docs/02-CLUSTER-RULES.md §3.1, keputusan stakeholder
 * KSB) — dijalankan manual satu kali untuk melengkapi histori customer sebelum
 * migrasi, lalu Database All jadi satu-satunya jalur upload rutin.
 *
 * Idempoten: source_transaction_key content-based (phone+tanggal+produk
 * canonical+qty+amount), unique index ksb_transactions_source_key_uq menjamin
 * run ulang (file sama atau file lain yang overlap) tidak menggandakan transaksi.
 *
 *   npm run import:legacy-ksb -- "<path ke file DataKSB.csv>"
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import Papa from "papaparse";
import { parseKsbRows } from "../src/server/import/ksb-parser";
import { rebuildClusters, rebuildRfm, upsertKsbCanonical } from "../src/server/import/orchestrator";
import { withTransaction } from "../src/server/db/transaction";
import type { SourceRow } from "../src/server/import/types";

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: npm run import:legacy-ksb -- "<path ke file DataKSB.csv>"');
  process.exit(1);
}

const text = readFileSync(csvPath, "utf-8");
const fileHash = createHash("sha256").update(text).digest("hex");
const parsedCsv = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
if (parsedCsv.errors.length) {
  console.error("CSV parse error:", parsedCsv.errors.slice(0, 5));
  process.exit(1);
}
const rows: SourceRow[] = parsedCsv.data.map((values, i) => ({ rowNumber: i + 2, values }));

const result = parseKsbRows(rows);

console.log("=== PARSE ===");
console.log(`File                        : ${csvPath}`);
console.log(`Total baris sumber          : ${rows.length}`);
console.log(`Excluded (phone/tanggal)    : ${result.excluded.length}`);
console.log(`SKIPPED_NON_KSB_FROM_LEGACY : ${result.skippedNonKsb.length}`);
console.log(`Transaksi KSB valid (dedup) : ${result.transactions.length}`);

const summary = await withTransaction(async (client) => {
  const existing = await client.query<{ id: number }>(
    "SELECT id FROM import_batches WHERE source_type = 'KSB' AND file_hash = $1",
    [fileHash]
  );

  let batchId: number;
  if (existing.rows[0]) {
    batchId = existing.rows[0].id;
    console.log(`\nFile ini sudah pernah di-import sebelumnya (batch #${batchId}) — lanjut idempotent upsert.`);
  } else {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO import_batches (source_type, filename, file_hash, status, total_rows)
       VALUES ('KSB', $1, $2, 'PROCESSING', $3)
       RETURNING id`,
      [csvPath, fileHash, rows.length]
    );
    batchId = inserted.rows[0]!.id;
    console.log(`\nBatch KSB baru dibuat: #${batchId}`);
  }

  // Audit trail baris legacy yang product_family-nya BUKAN KSB (mis. PBH 70).
  // DELETE dulu supaya run ulang tidak menggandakan baris audit.
  await client.query(
    "DELETE FROM data_quality_issues WHERE import_batch_id = $1 AND issue_type = 'SKIPPED_NON_KSB_FROM_LEGACY'",
    [batchId]
  );
  for (const skipped of result.skippedNonKsb) {
    await client.query(
      `INSERT INTO data_quality_issues (import_batch_id, issue_type, detail)
       VALUES ($1, 'SKIPPED_NON_KSB_FROM_LEGACY', $2::jsonb)`,
      [
        batchId,
        JSON.stringify({
          rowNumber: skipped.rowNumber,
          rawProductName: skipped.rawProductName,
          productCode: skipped.productCode,
        }),
      ]
    );
  }

  const upsertResult = await upsertKsbCanonical(client, result.transactions, batchId);

  await client.query(
    `UPDATE import_batches SET
       status = 'COMPLETED', is_active = true,
       total_rows = $2, valid_rows = $3, excluded_rows = $4, needs_review_rows = 0,
       error_message = NULL
     WHERE id = $1`,
    [
      batchId,
      rows.length,
      result.transactions.length,
      result.excluded.length + result.skippedNonKsb.length,
    ]
  );

  // Rebuild RFM/Cluster supaya Cluster B langsung mencerminkan backfill ini —
  // hanya bisa jalan kalau sudah ada Database All aktif (as_of_date wajib dari
  // dataset aktif, bukan NOW(), aturan #6 CLAUDE.md).
  const activeDbAll = await client.query<{ id: number; as_of_date: string | null }>(
    "SELECT id, as_of_date::text FROM import_batches WHERE source_type = 'DATABASE_ALL' AND is_active = true LIMIT 1"
  );
  let clusterBCount: number | null = null;
  let yaconaNonCohortCount: number | null = null;
  if (activeDbAll.rows[0]?.as_of_date) {
    const dbAll = activeDbAll.rows[0];
    await rebuildRfm(client, dbAll.as_of_date!);
    await rebuildClusters(client, dbAll.id, dbAll.as_of_date!);
    const clusterCounts = await client.query<{ cluster_code: string; n: string }>(
      `SELECT cluster_code, COUNT(*)::text AS n FROM customer_cluster_current
       WHERE cluster_code IN ('B', 'YACONA_NON_COHORT') GROUP BY cluster_code`
    );
    clusterBCount = Number(clusterCounts.rows.find((r) => r.cluster_code === "B")?.n ?? 0);
    yaconaNonCohortCount = Number(
      clusterCounts.rows.find((r) => r.cluster_code === "YACONA_NON_COHORT")?.n ?? 0
    );
  }

  return { batchId, ...upsertResult, clusterBCount, yaconaNonCohortCount };
});

console.log("\n=== MIGRATION SUMMARY ===");
console.log(`Batch KSB id                    : ${summary.batchId}`);
console.log(`Baris sumber                     : ${rows.length}`);
console.log(`Excluded (phone/tanggal invalid) : ${result.excluded.length}`);
console.log(`SKIPPED_NON_KSB_FROM_LEGACY      : ${result.skippedNonKsb.length}`);
console.log(`Transaksi KSB diproses           : ${result.transactions.length}`);
console.log(`  -> baru diinsert                : ${summary.inserted}`);
console.log(`  -> sudah ada (idempotent skip)   : ${summary.skippedExisting}`);
if (summary.clusterBCount !== null) {
  console.log(`Cluster B (setelah rebuild)       : ${summary.clusterBCount}`);
  console.log(`YACONA_NON_COHORT (setelah rebuild): ${summary.yaconaNonCohortCount}`);
} else {
  console.log(
    "Belum ada Database All aktif — Cluster B/RFM akan otomatis ter-update saat Database All berikutnya di-commit."
  );
}
process.exit(0);
