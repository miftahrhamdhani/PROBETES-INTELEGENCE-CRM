import fs from "fs";
import path from "path";
import { neon } from "@neondatabase/serverless";
import { withTransaction } from "../src/server/db/transaction";
import { rebuildClusters } from "../src/server/import/orchestrator";

// Load .env and .env.local manually
for (const envFile of [".env", ".env.local"]) {
  try {
    const envContent = fs.readFileSync(path.resolve(process.cwd(), envFile), "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        if (key) {
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          process.env[key] = value.trim();
        }
      }
    }
  } catch {
    // ignore
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sqlClient = neon(url);

  // 1. Snapshot BEFORE
  const beforeCountsRows = await sqlClient`
    SELECT cluster_code, COUNT(*)::int AS count
    FROM customer_cluster_current
    GROUP BY cluster_code
    ORDER BY cluster_code
  `;
  const beforeMap = new Map<string, number>();
  for (const r of beforeCountsRows) {
    beforeMap.set(r.cluster_code as string, r.count as number);
  }

  // Also snapshot cluster assignments per customer before recalculation
  const beforeCustClusterRows = await sqlClient`
    SELECT customer_id, cluster_code
    FROM customer_cluster_current
  `;
  const beforeCustMap = new Map<number, string>();
  for (const r of beforeCustClusterRows) {
    beforeCustMap.set(r.customer_id as number, r.cluster_code as string);
  }

  // Get active batch id and as_of_date
  const activeBatch = await sqlClient`
    SELECT id, as_of_date
    FROM import_batches
    WHERE status = 'COMPLETED' AND source_type = 'DATABASE_ALL' AND is_active = true
    LIMIT 1
  `;
  const firstBatch = activeBatch[0];
  if (!firstBatch) {
    throw new Error("Tidak ada batch Database All aktif");
  }
  const batchId = firstBatch.id as number;
  // Kolom DATE dikembalikan driver sebagai Date pada tengah malam LOKAL.
  // toISOString() akan menggeser mundur 1 hari di timezone GMT+7 — baca komponen
  // kalender lokal, bukan UTC (sama seperti toISODateLocal di normalize/date.ts).
  const rawDate = firstBatch.as_of_date;
  const asOfDate =
    rawDate instanceof Date
      ? `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, "0")}-${String(rawDate.getDate()).padStart(2, "0")}`
      : String(rawDate).slice(0, 10);

  console.log(`Active Batch ID: ${batchId}, as_of_date: ${asOfDate}`);

  // 2. Rebuild clusters in a transaction
  await withTransaction(async (client) => {
    await rebuildClusters(client, batchId, asOfDate);
  });

  console.log("Recalculate cluster SELESAI.\n");

  // 3. Snapshot AFTER
  const afterCountsRows = await sqlClient`
    SELECT cluster_code, COUNT(*)::int AS count
    FROM customer_cluster_current
    GROUP BY cluster_code
    ORDER BY cluster_code
  `;
  const afterMap = new Map<string, number>();
  for (const r of afterCountsRows) {
    afterMap.set(r.cluster_code as string, r.count as number);
  }

  const afterCustClusterRows = await sqlClient`
    SELECT customer_id, cluster_code
    FROM customer_cluster_current
  `;
  const afterCustMap = new Map<number, string>();
  for (const r of afterCustClusterRows) {
    afterCustMap.set(r.customer_id as number, r.cluster_code as string);
  }

  // 4. Compare BEFORE vs AFTER
  const allClusters = Array.from(new Set([...beforeMap.keys(), ...afterMap.keys()])).sort();
  console.log("=== PERBANDINGAN CLUSTER BEFORE vs AFTER ===");
  console.table(
    allClusters.map((c) => ({
      Cluster: c,
      BEFORE: beforeMap.get(c) ?? 0,
      AFTER: afterMap.get(c) ?? 0,
      Selisih: (afterMap.get(c) ?? 0) - (beforeMap.get(c) ?? 0),
    }))
  );

  // 5. Movements from NEEDS_REVIEW
  let movedFromNeedsReviewToD_New = 0;
  let movedFromNeedsReviewToD_Old = 0;
  let movedFromNeedsReviewToDhp_New = 0;
  let movedFromNeedsReviewToDhp_Old = 0;
  let movedFromNeedsReviewOther = 0;

  for (const [custId, oldCluster] of beforeCustMap.entries()) {
    if (oldCluster === "NEEDS_REVIEW") {
      const newCluster = afterCustMap.get(custId);
      if (newCluster === "D_NEW") movedFromNeedsReviewToD_New++;
      else if (newCluster === "D_OLD") movedFromNeedsReviewToD_Old++;
      else if (newCluster === "DHP_NEW") movedFromNeedsReviewToDhp_New++;
      else if (newCluster === "DHP_OLD") movedFromNeedsReviewToDhp_Old++;
      else if (newCluster !== "NEEDS_REVIEW") movedFromNeedsReviewOther++;
    }
  }

  console.log("\n=== PERPINDAHAN DARI NEEDS_REVIEW ===");
  console.log(`Pindah ke D_NEW   : ${movedFromNeedsReviewToD_New}`);
  console.log(`Pindah ke D_OLD   : ${movedFromNeedsReviewToD_Old}`);
  console.log(`Pindah ke DHP_NEW : ${movedFromNeedsReviewToDhp_New}`);
  console.log(`Pindah ke DHP_OLD : ${movedFromNeedsReviewToDhp_Old}`);
  console.log(`Pindah ke Lainnya : ${movedFromNeedsReviewOther}`);
  console.log(
    `Total Terbantu    : ${
      movedFromNeedsReviewToD_New +
      movedFromNeedsReviewToD_Old +
      movedFromNeedsReviewToDhp_New +
      movedFromNeedsReviewToDhp_Old +
      movedFromNeedsReviewOther
    }`
  );

  // 6. Check 11 conflict customer
  const conflictCusts = await sqlClient`
    SELECT (detail->>'customerId')::int AS customer_id
    FROM data_quality_issues
    WHERE issue_type = 'GROUP_STATUS_CONFLICT'
  `;
  console.log("\n=== STATUS 11 CUSTOMER CONFLICT ===");
  let conflictsStillNeedsReview = 0;
  for (const r of conflictCusts) {
    const custId = r.customer_id as number;
    const cluster = afterCustMap.get(custId);
    if (cluster === "NEEDS_REVIEW") conflictsStillNeedsReview++;
  }
  console.log(`Total conflict customer: ${conflictCusts.length}`);
  console.log(`Tetap NEEDS_REVIEW    : ${conflictsStillNeedsReview}`);

  // 7. Check Cluster B total
  console.log(`\nCluster B count AFTER : ${afterMap.get("B") ?? 0} (Wajib 1.018)`);

  // 8. Check CRM Manual group memberships
  const manualMemberships = await sqlClient`
    SELECT COUNT(*)::int AS count
    FROM customer_group_memberships
    WHERE source = 'CRM_MANUAL'
  `;
  console.log(`Total CRM_MANUAL membership rows: ${manualMemberships[0]?.count ?? 0}`);
}

main().catch(console.error);
