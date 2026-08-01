/**
 * Backfill SEKALI-JALAN: masukWA/BackupMasukGrup/tidakmasukWA (workbook cohort
 * legacy) -> customer_group_memberships. Bukan workflow upload rutin — setelah
 * migrasi ini, status grup dikelola CRM langsung dari Customer All, bukan lewat
 * upload ulang file legacy.
 *
 * Idempoten: upsert per customer_id (unique index customer_group_memberships_
 * customer_uq), guard WHERE source != 'CRM_MANUAL' supaya run ulang (atau import
 * lama yang re-trigger) tidak pernah menimpa keputusan manual CRM.
 *
 *   npm run import:legacy-group-membership -- "<path ke [Web Based] COHORT ANALYSIS - ALL PRODUCT.xlsx>"
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { parseGroupListRows } from "../src/server/import/group-list-parser";
import { resolveMembershipBackfill } from "../src/server/import/group-membership-resolver";
import { rebuildClusters, rebuildRfm } from "../src/server/import/orchestrator";
import { withTransaction, type TransactionClient } from "../src/server/db/transaction";
import type { SourceRow } from "../src/server/import/types";

const xlsxPath =
  process.argv[2] ??
  "C:/Users/Miftah Ramdhani/OneDrive/Dokumen/[Web Based] COHORT ANALYSIS - ALL PRODUCT.xlsx";

const CLUSTER_CODES_TO_REPORT = [
  "C_PRODIG",
  "C_HP",
  "C_F2",
  "D_NEW",
  "D_OLD",
  "DHP_NEW",
  "DHP_OLD",
] as const;

function sheetRows(workbook: XLSX.WorkBook, sheetName: string): SourceRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet '${sheetName}' tidak ditemukan`);
  const values = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  return values.map((row, index) => ({ rowNumber: index + 2, values: row }));
}

async function clusterCounts(client: TransactionClient): Promise<Record<string, number>> {
  const result = await client.query<{ cluster_code: string; n: string }>(
    `SELECT cluster_code, COUNT(*)::text AS n FROM customer_cluster_current
     WHERE cluster_code = ANY($1::text[]) GROUP BY cluster_code`,
    [CLUSTER_CODES_TO_REPORT]
  );
  const counts: Record<string, number> = {};
  for (const code of CLUSTER_CODES_TO_REPORT) counts[code] = 0;
  for (const row of result.rows) counts[row.cluster_code] = Number(row.n);
  return counts;
}

const fileBuffer = readFileSync(xlsxPath);
const fileHash = createHash("sha256").update(fileBuffer).digest("hex");
const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });

const masukWa = parseGroupListRows(sheetRows(workbook, "masukWA"), "masukWA");
const backup = parseGroupListRows(sheetRows(workbook, "BackupMasukGrup"), "BackupMasukGrup");
const tidakMasukWa = parseGroupListRows(sheetRows(workbook, "tidakmasukWA"), "tidakmasukWA");

console.log("=== PARSE ===");
console.log(`masukWA          : ${masukWa.entries.length} valid (${masukWa.excluded.length} excluded) dari ${masukWa.totalSourceRows} baris`);
console.log(`BackupMasukGrup  : ${backup.entries.length} valid (${backup.excluded.length} excluded) dari ${backup.totalSourceRows} baris`);
console.log(`tidakmasukWA     : ${tidakMasukWa.entries.length} valid (${tidakMasukWa.excluded.length} excluded) dari ${tidakMasukWa.totalSourceRows} baris`);

const resolved = resolveMembershipBackfill(masukWa.entries, backup.entries, tidakMasukWa.entries);
const conflicts = resolved.filter((r) => r.conflict);
console.log(`\nResolved         : ${resolved.length} nomor unik`);
console.log(`  GROUPED        : ${resolved.filter((r) => r.status === "GROUPED").length}`);
console.log(`  NOT_GROUPED    : ${resolved.filter((r) => r.status === "NOT_GROUPED").length}`);
console.log(`  UNKNOWN (conflict): ${conflicts.length}`);

const summary = await withTransaction(async (client) => {
  const existingBatch = await client.query<{ id: number }>(
    "SELECT id FROM import_batches WHERE source_type = 'GROUP_LIST' AND file_hash = $1",
    [fileHash]
  );
  let batchId: number;
  if (existingBatch.rows[0]) {
    batchId = existingBatch.rows[0].id;
    console.log(`\nFile ini sudah pernah di-import sebelumnya (batch #${batchId}) — lanjut idempotent upsert.`);
  } else {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO import_batches (source_type, filename, file_hash, status, total_rows)
       VALUES ('GROUP_LIST', $1, $2, 'PROCESSING', $3)
       RETURNING id`,
      [xlsxPath, fileHash, resolved.length]
    );
    batchId = inserted.rows[0]!.id;
    console.log(`\nBatch GROUP_LIST baru dibuat: #${batchId}`);
  }

  const beforeCounts = await clusterCounts(client);

  const phones = resolved.map((r) => r.normalizedPhone);
  const customerRows = await client.query<{ id: number; normalized_phone: string }>(
    "SELECT id, normalized_phone FROM customers WHERE normalized_phone = ANY($1::text[])",
    [phones]
  );
  const customerIdByPhone = new Map(customerRows.rows.map((r) => [r.normalized_phone, r.id]));
  const matched = resolved.filter((r) => customerIdByPhone.has(r.normalizedPhone));
  const unmatchedCount = resolved.length - matched.length;

  const matchedCustomerIds = matched.map((r) => customerIdByPhone.get(r.normalizedPhone)!);
  const existingStatusRows = await client.query<{ customer_id: number; status: string }>(
    "SELECT customer_id, status FROM customer_group_memberships WHERE customer_id = ANY($1::int[])",
    [matchedCustomerIds]
  );
  const oldStatusByCustomerId = new Map(existingStatusRows.rows.map((r) => [r.customer_id, r.status]));

  const CHUNK = 2_000;
  let upserted = 0;
  let skippedManual = 0;
  for (let i = 0; i < matched.length; i += CHUNK) {
    const group = matched.slice(i, i + CHUNK);
    const customerIds = group.map((r) => customerIdByPhone.get(r.normalizedPhone)!);
    const statuses = group.map((r) => r.status);
    const sources = group.map((r) => r.source);

    const result = await client.query<{ customer_id: number }>(
      `INSERT INTO customer_group_memberships (customer_id, status, source, source_batch_id, updated_at)
       SELECT t.customer_id, t.status::group_membership_status, t.source::group_membership_source, $4, now()
       FROM unnest($1::int[], $2::text[], $3::text[]) AS t(customer_id, status, source)
       ON CONFLICT (customer_id) DO UPDATE SET
         status = EXCLUDED.status,
         source = EXCLUDED.source,
         source_batch_id = EXCLUDED.source_batch_id,
         updated_at = now()
       WHERE customer_group_memberships.source != 'CRM_MANUAL'
       RETURNING customer_id`,
      [customerIds, statuses, sources, batchId]
    );
    upserted += result.rows.length;
    skippedManual += group.length - result.rows.length;

    const updatedIds = new Set(result.rows.map((r) => r.customer_id));
    const historyGroup = group.filter((r) => updatedIds.has(customerIdByPhone.get(r.normalizedPhone)!));
    if (historyGroup.length) {
      await client.query(
        `INSERT INTO customer_group_membership_history (customer_id, old_status, new_status, source, changed_by)
         SELECT t.customer_id, t.old_status::group_membership_status, t.new_status::group_membership_status, t.source::group_membership_source, NULL
         FROM unnest($1::int[], $2::text[], $3::text[], $4::text[]) AS t(customer_id, old_status, new_status, source)`,
        [
          historyGroup.map((r) => customerIdByPhone.get(r.normalizedPhone)!),
          historyGroup.map((r) => oldStatusByCustomerId.get(customerIdByPhone.get(r.normalizedPhone)!) ?? null),
          historyGroup.map((r) => r.status),
          historyGroup.map((r) => r.source),
        ]
      );
    }
  }

  const matchedConflicts = conflicts.filter((r) => customerIdByPhone.has(r.normalizedPhone));
  for (const conflict of matchedConflicts) {
    await client.query(
      `INSERT INTO data_quality_issues (import_batch_id, issue_type, detail)
       VALUES ($1, 'GROUP_STATUS_CONFLICT', $2::jsonb)`,
      [
        batchId,
        JSON.stringify({
          normalizedPhone: conflict.normalizedPhone,
          customerId: customerIdByPhone.get(conflict.normalizedPhone),
          note: "Ada di masukWA/BackupMasukGrup DAN tidakmasukWA — status di-set UNKNOWN, butuh keputusan manual CRM.",
        }),
      ]
    );
  }

  await client.query(
    `UPDATE import_batches SET
       status = 'COMPLETED', is_active = true,
       total_rows = $2, valid_rows = $3, excluded_rows = $4, needs_review_rows = $5,
       error_message = NULL
     WHERE id = $1`,
    [batchId, resolved.length, upserted, unmatchedCount, matchedConflicts.length]
  );

  const activeDbAll = await client.query<{ id: number; as_of_date: string | null }>(
    "SELECT id, as_of_date::text FROM import_batches WHERE source_type = 'DATABASE_ALL' AND is_active = true LIMIT 1"
  );
  let afterCounts: Record<string, number> | null = null;
  if (activeDbAll.rows[0]?.as_of_date) {
    const dbAll = activeDbAll.rows[0];
    await rebuildRfm(client, dbAll.as_of_date!);
    await rebuildClusters(client, dbAll.id, dbAll.as_of_date!);
    afterCounts = await clusterCounts(client);
  }

  return {
    batchId,
    upserted,
    skippedManual,
    unmatchedCount,
    conflictCount: matchedConflicts.length,
    beforeCounts,
    afterCounts,
  };
});

console.log("\n=== BACKFILL SUMMARY ===");
console.log(`Batch GROUP_LIST id      : ${summary.batchId}`);
console.log(`Upserted current rows    : ${summary.upserted}`);
console.log(`Skipped (source=CRM_MANUAL, tidak ditimpa) : ${summary.skippedManual}`);
console.log(`Unmatched legacy phone (tidak ada di customers) : ${summary.unmatchedCount}`);
console.log(`Conflict (GROUPED & NOT_GROUPED sekaligus) -> UNKNOWN : ${summary.conflictCount}`);

console.log("\n=== CLUSTER — SEBELUM vs SESUDAH BACKFILL ===");
console.log("Cluster       Sebelum   Sesudah");
console.log("---------------------------------");
for (const code of CLUSTER_CODES_TO_REPORT) {
  const before = summary.beforeCounts[code] ?? 0;
  const after = summary.afterCounts?.[code] ?? null;
  console.log(`${code.padEnd(12)}${String(before).padStart(9)}${after === null ? "        -" : String(after).padStart(9)}`);
}
if (summary.afterCounts) {
  const cProdig = summary.afterCounts.C_PRODIG ?? 0;
  console.log(`\nC-Prodig vs baseline legacy 1.259: ${cProdig} (selisih ${cProdig - 1259 >= 0 ? "+" : ""}${cProdig - 1259})`);
} else {
  console.log("\nBelum ada Database All aktif — cluster akan otomatis ter-update saat Database All berikutnya di-commit.");
}
process.exit(0);
