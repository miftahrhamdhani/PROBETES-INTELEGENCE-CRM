/**
 * Backfill drift canonical KSB — sekali jalan, IDEMPOTEN, mendukung dry-run.
 *
 *   npm run backfill:ksb            # dry-run (default, tidak menulis apa pun)
 *   npm run backfill:ksb -- --apply # benar-benar menulis
 *
 * Latar belakang (docs/08-RECONCILIATION.md §6.5): parser KSB sempat membaca
 * kolom "Total Harga" dengan exact-match sehingga amount terbaca 0. Amount ikut
 * jadi bagian content-key, jadi sebagian key di `ksb_transactions` menyimpang
 * dari yang dihasilkan parser saat ini:
 *   - MISSING : key yang parser hasilkan tapi belum ada di canonical
 *   - STALE   : key di canonical yang tidak lagi dihasilkan parser mana pun
 *
 * Yang dilakukan script ini:
 *   1. Parse ULANG seluruh staging Database All dengan parser TERBARU.
 *   2. Bandingkan dengan isi `ksb_transactions`.
 *   3. INSERT baris MISSING (ON CONFLICT DO NOTHING -> aman dijalankan berulang).
 *   4. LAPORKAN baris STALE — TIDAK menghapusnya.
 *   5. Cetak rekonsiliasi BEFORE/AFTER dan verifikasi Cluster B.
 *
 * KENAPA STALE TIDAK DIHAPUS: baris stale ternyata satu-satunya baris untuk
 * pasangan (phone, tanggal)-nya, dan amount-nya wajar (bukan 0). Menghapusnya
 * akan MENGHILANGKAN HARI UNIK yang nyata — satu customer bahkan akan kehilangan
 * seluruh transaksi KSB-nya, sehingga hilang dari customer_rfm_current dan
 * kehilangan cluster. Key-nya menyimpang, tetapi transaksinya sah. Yang benar
 * adalah membiarkannya sebagai histori, bukan menghapus data nyata demi
 * kerapian key. Kalau suatu saat memang harus dibersihkan, itu keputusan
 * pemilik proses bisnis dan butuh flag eksplisit --delete-stale.
 *
 * Cluster B tidak dipaksa ke angka tertentu: kalau data nyata menuntut berubah,
 * script melaporkannya apa adanya.
 */
import { Client } from "@neondatabase/serverless";
import { parseDatabaseAll } from "../src/server/import/database-all-parser";
import { loadApprovedAliasOverlayTx } from "../src/server/product/aliases";
import type { NormalizedKsbTransaction, SourceRow } from "../src/server/import/types";

const APPLY = process.argv.includes("--apply");

const client = new Client(process.env.DATABASE_URL);
await client.connect();

function log(...args: unknown[]) {
  console.log(...args);
}

async function snapshot() {
  const row = (
    await client.query<{ total: string; distinct_keys: string; from_db_all: string; cluster_b: string; yacona_gt5: string }>(
      `SELECT
         (SELECT COUNT(*) FROM ksb_transactions)::text AS total,
         (SELECT COUNT(DISTINCT source_transaction_key) FROM ksb_transactions)::text AS distinct_keys,
         (SELECT COUNT(*) FROM ksb_transactions WHERE source_batch_id IN
            (SELECT id FROM import_batches WHERE source_type = 'DATABASE_ALL'))::text AS from_db_all,
         (SELECT COUNT(*) FROM customer_cluster_current WHERE cluster_code = 'B')::text AS cluster_b,
         (SELECT COUNT(*) FROM customer_rfm_current WHERE yacona_frequency > 5)::text AS yacona_gt5`
    )
  ).rows[0]!;
  return {
    total: Number(row.total),
    distinctKeys: Number(row.distinct_keys),
    fromDbAll: Number(row.from_db_all),
    clusterB: Number(row.cluster_b),
    yaconaGt5: Number(row.yacona_gt5),
  };
}

try {
  log(`=== BACKFILL DRIFT KSB — mode ${APPLY ? "APPLY (menulis)" : "DRY-RUN (tidak menulis)"} ===\n`);

  const before = await snapshot();
  log("BEFORE:", before);

  // --- 1. Parse ulang seluruh staging Database All dengan parser terbaru ---
  const aliasOverlay = await loadApprovedAliasOverlayTx(client);
  const batches = (
    await client.query<{ id: number; filename: string }>(
      "SELECT id, filename FROM import_batches WHERE source_type = 'DATABASE_ALL' ORDER BY id"
    )
  ).rows;

  const parsedByKey = new Map<string, { tx: NormalizedKsbTransaction; batchId: number }>();
  for (const batch of batches) {
    const rows = (
      await client.query<SourceRow>(
        'SELECT row_number AS "rowNumber", raw_data AS values FROM staging_import_rows WHERE import_batch_id = $1 ORDER BY row_number',
        [batch.id]
      )
    ).rows;
    const parsed = parseDatabaseAll(rows, aliasOverlay);
    for (const tx of parsed.ksbTransactions) {
      if (!parsedByKey.has(tx.sourceKey)) parsedByKey.set(tx.sourceKey, { tx, batchId: batch.id });
    }
    log(`  batch ${batch.id} (${batch.filename}): ${rows.length} staging -> ${parsed.ksbTransactions.length} key KSB`);
  }
  log(`  total key KSB dari parser terbaru: ${parsedByKey.size}\n`);

  // --- 2. Bandingkan dengan canonical ---
  const canonical = new Map(
    (
      await client.query<{ key: string; source_batch_id: number }>(
        "SELECT source_transaction_key AS key, source_batch_id FROM ksb_transactions"
      )
    ).rows.map((r) => [r.key, r.source_batch_id])
  );
  const dbAllBatchIds = new Set(batches.map((b) => b.id));

  const missing = [...parsedByKey.values()].filter(({ tx }) => !canonical.has(tx.sourceKey));
  const stale = [...canonical.entries()]
    .filter(([key, batchId]) => dbAllBatchIds.has(batchId) && !parsedByKey.has(key))
    .map(([key]) => key);

  log(`MISSING (parser punya, canonical belum) : ${missing.length}`);
  for (const { tx } of missing.slice(0, 20)) {
    log(`  + ${tx.transactionDate} ${tx.normalizedPhone} "${tx.productName}" amount=${tx.amount}`);
  }
  log(`STALE (canonical punya, parser tidak lagi, asal Database All) : ${stale.length}  [TIDAK DIHAPUS]`);
  for (const key of stale.slice(0, 20)) log(`  ~ ${key}`);

  // Cek dampak: kalau baris stale dihapus, apakah ada hari unik yang hilang?
  if (stale.length) {
    const impact = await client.query<{ key: string; phone: string; d: string; rows_that_day: string; unique_days: string }>(
      `SELECT k.source_transaction_key AS key, k.customer_phone AS phone, k.transaction_date::text AS d,
              (SELECT COUNT(*) FROM ksb_transactions o
                WHERE o.customer_phone = k.customer_phone AND o.transaction_date = k.transaction_date)::text AS rows_that_day,
              (SELECT COUNT(DISTINCT transaction_date) FROM ksb_transactions o
                WHERE o.customer_phone = k.customer_phone)::text AS unique_days
       FROM ksb_transactions k
       WHERE k.source_transaction_key = ANY($1::text[])`,
      [stale]
    );
    const wouldLoseDay = impact.rows.filter((r) => Number(r.rows_that_day) === 1);
    log(
      `  -> ${wouldLoseDay.length} dari ${stale.length} baris stale adalah SATU-SATUNYA baris di tanggalnya; ` +
        `menghapusnya akan menghilangkan hari unik nyata (memengaruhi yacona_frequency).`
    );
    for (const r of wouldLoseDay) {
      log(`     ${r.phone} ${r.d} — hari unik saat ini ${r.unique_days} -> ${Number(r.unique_days) - 1} bila dihapus`);
    }
    log("  Karena itu baris stale DIBIARKAN. Transaksinya sah, hanya key-nya yang menyimpang.");
  }
  log("");

  if (!missing.length) {
    log("Tidak ada baris yang perlu ditambahkan. Canonical KSB sudah memuat seluruh key dari parser terbaru.");
  } else if (!APPLY) {
    log("DRY-RUN: tidak ada perubahan ditulis. Jalankan ulang dengan --apply untuk menerapkan.");
  } else {
    await client.query("BEGIN");
    try {
      // --- 3. INSERT missing (idempoten lewat unique key) ---
      let inserted = 0;
      if (missing.length) {
        const result = await client.query(
          `INSERT INTO ksb_transactions (
             source_transaction_key, customer_phone, customer_id, transaction_date,
             product_name, amount, source_batch_id
           )
           SELECT t.key, t.phone, c.id, t.date::date, t.product, t.amount::bigint, t.batch_id::int
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[])
             AS t(key, phone, date, product, amount, batch_id)
           LEFT JOIN customers c ON c.normalized_phone = t.phone
           ON CONFLICT (source_transaction_key) DO NOTHING`,
          [
            missing.map(({ tx }) => tx.sourceKey),
            missing.map(({ tx }) => tx.normalizedPhone),
            missing.map(({ tx }) => tx.transactionDate),
            missing.map(({ tx }) => tx.productName),
            missing.map(({ tx }) => tx.amount.toString()),
            missing.map(({ batchId }) => batchId),
          ]
        );
        inserted = result.rowCount ?? 0;
      }

      // --- 4. STALE sengaja TIDAK dihapus (lihat penjelasan di header file) ---

      await client.query("COMMIT");
      log(`APPLIED: ${inserted} inserted, 0 deleted (baris stale sengaja dipertahankan).`);
      log("Catatan: yacona_frequency & Cluster B ikut berubah hanya bila hari unik customer berubah.");
      log("Jalankan `npm run recalc:audit` (atau import berikutnya) bila angka cluster perlu di-refresh.\n");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  // --- 5. Rekonsiliasi AFTER ---
  const after = await snapshot();
  log("AFTER:", after);
  log("");
  // Canonical asal Database All = key parser terbaru + baris stale yang sengaja
  // dipertahankan. Persamaan inilah yang harus balance, bukan kesamaan mentah.
  const expectedFromDbAll = parsedByKey.size + stale.length;
  const balanced = expectedFromDbAll === after.fromDbAll;

  log("RECONCILIATION");
  log(`  key dari parser terbaru                : ${parsedByKey.size}`);
  log(`  baris stale dipertahankan (histori sah): ${stale.length}`);
  log(`  diharapkan asal Database All           : ${expectedFromDbAll}`);
  log(`  canonical asal Database All (nyata)    : ${after.fromDbAll}`);
  log(`  balance                                : ${balanced ? "YA ✓" : `TIDAK (selisih ${after.fromDbAll - expectedFromDbAll})`}`);
  log(`  total canonical = key unik             : ${after.total === after.distinctKeys ? "YA ✓" : "TIDAK"} (${after.total} / ${after.distinctKeys})`);
  log(`  Cluster B  ${before.clusterB} -> ${after.clusterB} (${after.clusterB - before.clusterB >= 0 ? "+" : ""}${after.clusterB - before.clusterB})`);
  log(`  yacona_frequency > 5: ${before.yaconaGt5} -> ${after.yaconaGt5}`);

  if (APPLY && !balanced) {
    log("\nPERINGATAN: masih ada selisih di luar baris stale. Periksa tabrakan key dengan Legacy.");
  }
} finally {
  await client.end();
}
