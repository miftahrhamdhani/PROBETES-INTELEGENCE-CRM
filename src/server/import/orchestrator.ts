import { sql } from "drizzle-orm";
import type { QueryResult, QueryResultRow } from "@neondatabase/serverless";
import { getDb } from "@/server/db/client";
import { withTransaction, type TransactionClient } from "@/server/db/transaction";
import { importBatches, stagingImportRows } from "@/server/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { RULE_VERSION } from "@/lib/cluster-codes";
import type {
  ImportCommitResult,
  ImportIssueCode,
  ImportPreview,
} from "@/lib/import-contracts";
import { assignCluster } from "@/server/cluster/engine";
import { buildCustomerFeatures } from "@/server/cluster/features";
import type { GroupStatus, RawOrderInput } from "@/server/cluster/types";
import {
  type CanonicalProductCode,
  productFlagsForCode,
} from "@/server/normalize/product-catalog";
import { detectNewCustomersFromBatch } from "@/server/workspace/detection";
import { allocateOrderComponents } from "@/server/workspace/allocation";
import { classifyCrmTransaction, createOrderFingerprint } from "@/server/workspace/classification";
import { sourceValue } from "./source-row";
import { reconcileImportCandidates } from "@/server/workspace/reconciliation";
import { loadApprovedAliasOverlay } from "@/server/product/aliases";
import { parseDatabaseAll } from "./database-all-parser";
import type {
  DatabaseAllParseResult,
  NormalizedDailyOrder,
  NormalizedKsbTransaction,
  SourceRow,
} from "./types";

const IMPORT_LOCK = 918273645;
const BATCH_SIZE = 5_000;

export class ImportBusyError extends Error {}

export async function initDatabaseAllImport(input: {
  filename: string;
  fileHash: string;
  totalRows: number;
}): Promise<{ batchId: number; duplicate: boolean; completed: boolean }> {
  const db = getDb();
  // Batch FAILED SENGAJA diabaikan di sini. Percobaan yang gagal bukan sesuatu
  // yang bisa dilanjutkan — stageDatabaseAllRows() memang menolak status FAILED
  // (guard itu benar dan tetap dipertahankan). Sebelumnya lookup ini tidak
  // memfilter status, sehingga upload ulang file yang sama mengembalikan batch
  // FAILED lama lalu chunk-nya ditolak: buntu, dan satu-satunya jalan keluar
  // adalah mengubah isi file agar hash-nya berbeda.
  //
  // Sekarang batch FAILED dibiarkan apa adanya sebagai riwayat (status,
  // error_message, staging tetap utuh) dan percobaan berikutnya mendapat BATCH
  // BARU dengan file_hash yang sama — dimungkinkan oleh partial unique index di
  // migration 0023. `ORDER BY id DESC` memastikan yang dilihat adalah percobaan
  // TERAKHIR, bukan yang paling lama.
  const existing = await db
    .select({ id: importBatches.id, status: importBatches.status })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.sourceType, "DATABASE_ALL"),
        eq(importBatches.fileHash, input.fileHash.toLowerCase()),
        ne(importBatches.status, "FAILED")
      )
    )
    .orderBy(desc(importBatches.id))
    .limit(1);
  if (existing[0]) {
    return {
      batchId: existing[0].id,
      duplicate: true,
      completed: existing[0].status === "COMPLETED",
    };
  }

  const [batch] = await db
    .insert(importBatches)
    .values({
      sourceType: "DATABASE_ALL",
      filename: input.filename,
      fileHash: input.fileHash.toLowerCase(),
      totalRows: input.totalRows,
      status: "UPLOADING",
    })
    .returning({ id: importBatches.id });
  if (!batch) throw new Error("Gagal membuat import batch");
  return { batchId: batch.id, duplicate: false, completed: false };
}

export async function stageDatabaseAllRows(batchId: number, rows: SourceRow[]): Promise<void> {
  const db = getDb();
  if (!rows.length) return;
  const batch = await getDatabaseAllBatch(batchId);
  if (batch.status === "COMPLETED") return;
  if (batch.status !== "UPLOADING" && batch.status !== "STAGED") {
    // Guard ini BENAR dan tetap dipertahankan: batch gagal tidak boleh
    // dilanjutkan. Yang diperbaiki hanya pesannya — sebelumnya pesan sekunder
    // ini menutupi penyebab sebenarnya, sehingga yang terbaca user adalah
    // "status FAILED tidak menerima chunk" alih-alih error yang benar-benar
    // menggagalkan import. Setelah perbaikan initDatabaseAllImport(), jalur ini
    // seharusnya tidak lagi tercapai lewat upload ulang biasa.
    throw new Error(
      batch.status === "FAILED" && batch.errorMessage
        ? `Import sebelumnya gagal: ${batch.errorMessage}`
        : `Batch status ${batch.status} tidak menerima chunk`
    );
  }

  await db
    .insert(stagingImportRows)
    .values(
      rows.map((row) => ({
        importBatchId: batchId,
        rowNumber: row.rowNumber,
        rawData: row.values,
      }))
    )
    .onConflictDoUpdate({
      target: [stagingImportRows.importBatchId, stagingImportRows.rowNumber],
      set: { rawData: sql`excluded.raw_data` },
    });
  await db
    .update(importBatches)
    .set({ status: "STAGED", errorMessage: null })
    .where(eq(importBatches.id, batchId));
}

export async function validateDatabaseAllImport(batchId: number): Promise<ImportPreview> {
  const batch = await getDatabaseAllBatch(batchId);
  if (batch.status === "COMPLETED") return previewForCompletedBatch(batch);

  const rows = await loadStagedRows(batchId);
  if (rows.length !== batch.totalRows) {
    throw new Error(`Chunk belum lengkap: ${rows.length}/${batch.totalRows} baris`);
  }
  // Mapping produk yang sudah di-approve admin ikut dipakai — supaya preview
  // menampilkan jumlah UNKNOWN yang sama dengan hasil commit nanti.
  const parsed = parseDatabaseAll(rows, await loadApprovedAliasOverlay());
  const issues = collectIssues(parsed);
  const excludedRows = parsed.excluded.length;
  const needsReviewRows = new Set(
    issues.filter((issue) => issue.code === "UNKNOWN_PRODUCT").map((issue) => issue.rowNumber)
  ).size;
  const validRows = parsed.totalSourceRows - excludedRows;

  // Array parameters must go through the WebSocket client, not neon-http:
  // db.execute(sql`...`) inlines large JS arrays as literal elements instead of
  // binding them, which blows past Postgres's row-constructor limit at scale.
  await withTransaction(async (client) => {
    await query(client, "DELETE FROM data_quality_issues WHERE import_batch_id = $1", [batchId]);
    await query(
      client,
      "UPDATE staging_import_rows SET validation_status = 'VALID', error_codes = '{}' WHERE import_batch_id = $1",
      [batchId]
    );

    for (const group of chunk(parsed.excluded, BATCH_SIZE)) {
      await query(
        client,
        `UPDATE staging_import_rows sr
         SET validation_status = 'EXCLUDED', error_codes = string_to_array(v.codes, ',')
         FROM unnest($2::int[], $3::text[]) AS v(row_number, codes)
         WHERE sr.import_batch_id = $1 AND sr.row_number = v.row_number`,
        [batchId, group.map((row) => row.rowNumber), group.map((row) => row.codes.join(","))]
      );
    }

    for (const group of chunk(issues, BATCH_SIZE)) {
      await query(
        client,
        `INSERT INTO data_quality_issues (import_batch_id, staging_row_id, issue_type, detail)
         SELECT $1, sr.id, v.issue_type::issue_type, v.detail::jsonb
         FROM unnest($2::int[], $3::text[], $4::text[]) AS v(row_number, issue_type, detail)
         JOIN staging_import_rows sr ON sr.import_batch_id = $1 AND sr.row_number = v.row_number`,
        [
          batchId,
          group.map((issue) => issue.rowNumber),
          group.map((issue) => issue.code),
          group.map((issue) => JSON.stringify(issue.detail)),
        ]
      );
    }

    const needsReviewRowNumbers = [
      ...new Set(
        issues.filter((issue) => issue.code === "UNKNOWN_PRODUCT").map((issue) => issue.rowNumber)
      ),
    ];
    if (needsReviewRowNumbers.length) {
      await query(
        client,
        `UPDATE staging_import_rows SET validation_status = 'NEEDS_REVIEW', error_codes = ARRAY['UNKNOWN_PRODUCT']
         WHERE import_batch_id = $1 AND row_number = ANY($2::int[])`,
        [batchId, needsReviewRowNumbers]
      );
    }

    await query(
      client,
      `UPDATE import_batches SET
         status = 'STAGED', as_of_date = $2, total_rows = $3, valid_rows = $4,
         excluded_rows = $5, needs_review_rows = $6, error_message = NULL
       WHERE id = $1`,
      [batchId, parsed.asOfDate, parsed.totalSourceRows, validRows, excludedRows, needsReviewRows]
    );
  });

  return buildPreview({ ...batch, status: "STAGED" }, parsed, needsReviewRows, false);
}

export async function commitDatabaseAllImport(batchId: number): Promise<ImportCommitResult> {
  const batch = await getDatabaseAllBatch(batchId);
  if (batch.status === "COMPLETED") return completedCommitResult(batchId);
  const rows = await loadStagedRows(batchId);
  if (rows.length !== batch.totalRows) throw new Error("Batch belum lengkap");
  const parsed = parseDatabaseAll(rows, await loadApprovedAliasOverlay());
  if (!parsed.asOfDate) throw new Error("Tidak ada order Probetes valid untuk diaktifkan");
  const asOfDate = parsed.asOfDate;
  const needsReviewRows = new Set(
    collectIssues(parsed)
      .filter((issue) => issue.code === "UNKNOWN_PRODUCT")
      .map((issue) => issue.rowNumber)
  ).size;

  try {
    return await withTransaction(async (client) => {
      const locked = await query<{ locked: boolean }>(
        client,
        "SELECT pg_try_advisory_xact_lock($1) AS locked",
        [IMPORT_LOCK]
      );
      if (!locked.rows[0]?.locked) throw new ImportBusyError("Import lain sedang diproses");

      const current = await query<{ status: string }>(
        client,
        "SELECT status FROM import_batches WHERE id = $1 FOR UPDATE",
        [batchId]
      );
      if (!current.rows[0]) throw new Error("Import batch tidak ditemukan");
      if (current.rows[0].status === "COMPLETED") {
        return completedCommitResultWithClient(client, batchId);
      }

      await query(
        client,
        "UPDATE import_batches SET status = 'PROCESSING', error_message = NULL WHERE id = $1",
        [batchId]
      );
      const products = await loadProductMap(client);
      if (!products.has("UNKNOWN")) {
        throw new Error("Produk canonical belum di-seed. Jalankan npm run db:seed");
      }

      await persistCrmClassifications(client, batchId, rows);
      const customerIdByPhone = await bulkUpsertCustomers(client, parsed.orders, batchId);
      const csIdByName = await bulkUpsertCsAgents(client, parsed.orders);
      const orderIdByKey = await bulkUpsertOrders(client, parsed.orders, customerIdByPhone, csIdByName, batchId);

      const orderIds = [...orderIdByKey.values()];
      for (const group of chunk(orderIds, BATCH_SIZE)) {
        await query(client, "DELETE FROM order_items WHERE order_id = ANY($1::bigint[])", [group]);
      }

      const itemCount = await bulkInsertItems(client, parsed.orders, orderIdByKey, products);

      // Item product_family=KSB yang nyasar di Database All (§3.1) — sebelumnya
      // dibuang total, sekarang ditangkap ke ksb_transactions supaya ikut Cluster B.
      // Key content-based (bukan row/batch) -> otomatis dedup lintas sumber dengan
      // Legacy KSB lewat ksb_transactions_source_key_uq, tidak menimpa order Probetes.
      await upsertKsbCanonical(client, parsed.ksbTransactions, batchId);

      await rebuildRfm(client, asOfDate);
      await rebuildClusters(client, batchId, asOfDate);

      // Workspace: reconciliation dan antrean customer baru tetap atomik dengan import.
      await reconcileImportCandidates(client);
      await detectNewCustomersFromBatch(client, batchId);

      // Batas domain: Database All BERHENTI di sini. Ia mengisi layer Analysis /
      // Customer Intelligence (orders/order_items legacy, RFM, Cohort, Frequency,
      // Cluster) dan TIDAK PERNAH menulis workspace_orders/workspace_order_items.
      // Provenance Workspace yang sah hanya 'MANUAL' — lihat
      // src/server/workspace/provenance.ts. Jangan pasang kembali pemanggilan
      // ingest Workspace di sini.

      await query(
        client,
        "UPDATE import_batches SET is_active = false WHERE source_type = 'DATABASE_ALL' AND id <> $1",
        [batchId]
      );
      await query(
        client,
        `UPDATE import_batches SET
          status = 'COMPLETED', is_active = true, as_of_date = $2,
          total_rows = $3, valid_rows = $4, excluded_rows = $5,
          needs_review_rows = $6, error_message = NULL
        WHERE id = $1`,
        [
          batchId,
          asOfDate,
          parsed.totalSourceRows,
          parsed.totalSourceRows - parsed.excluded.length,
          parsed.excluded.length,
          needsReviewRows,
        ]
      );

      return {
        batchId,
        asOfDate,
        customers: customerIdByPhone.size,
        orders: parsed.orders.length,
        items: itemCount,
        excludedRows: parsed.excluded.length,
        needsReviewRows,
      };
    });
  } catch (error) {
    if (!(error instanceof ImportBusyError)) {
      await getDb()
        .update(importBatches)
        .set({
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Commit gagal",
        })
        .where(eq(importBatches.id, batchId));
    }
    throw error;
  }
}

async function persistCrmClassifications(
  client: TransactionClient,
  batchId: number,
  rows: SourceRow[]
): Promise<void> {
  const rowNumbers: number[] = [];
  const included: boolean[] = [];
  const inclusionReasons: Array<string | null> = [];
  const exclusionReasons: Array<string | null> = [];
  const mappingVersions: string[] = [];
  for (const row of rows) {
    const classification = classifyCrmTransaction({
      division: sourceValue(row, "DIVISI"),
      platform: sourceValue(row, "Platform"),
    });
    rowNumbers.push(row.rowNumber);
    included.push(classification.included);
    inclusionReasons.push(classification.inclusionReason);
    exclusionReasons.push(classification.exclusionReason);
    mappingVersions.push(classification.mappingVersion);
  }
  for (let start = 0; start < rowNumbers.length; start += BATCH_SIZE) {
    const end = start + BATCH_SIZE;
    await query(
      client,
      `UPDATE staging_import_rows sr SET
         is_crm_transaction = v.included,
         crm_inclusion_reason = v.inclusion_reason,
         crm_exclusion_reason = v.exclusion_reason,
         crm_mapping_version = v.mapping_version,
         classified_at = now()
       FROM unnest($2::int[], $3::bool[], $4::text[], $5::text[], $6::text[])
         AS v(row_number, included, inclusion_reason, exclusion_reason, mapping_version)
       WHERE sr.import_batch_id = $1 AND sr.row_number = v.row_number`,
      [
        batchId,
        rowNumbers.slice(start, end),
        included.slice(start, end),
        inclusionReasons.slice(start, end),
        exclusionReasons.slice(start, end),
        mappingVersions.slice(start, end),
      ]
    );
  }
}

async function bulkUpsertCustomers(
  client: TransactionClient,
  orders: NormalizedDailyOrder[],
  batchId: number
): Promise<Map<string, number>> {
  // Array order preserved: last occurrence per phone wins (orders sorted by date|phone).
  const byPhone = new Map<string, { displayPhone: string | null; name: string | null }>();
  for (const order of orders) {
    byPhone.set(order.normalizedPhone, {
      displayPhone: order.displayPhone || null,
      name: order.customerName || null,
    });
  }
  const result = new Map<string, number>();
  for (const group of chunk([...byPhone.entries()], BATCH_SIZE)) {
    const phones = group.map(([phone]) => phone);
    const displayPhones = group.map(([, v]) => v.displayPhone);
    const names = group.map(([, v]) => v.name);
    const rows = await query<{ id: number; normalized_phone: string }>(
      client,
      `INSERT INTO customers (normalized_phone, display_phone, name, first_seen_batch_id, updated_at)
       SELECT phone, display_phone, name, $4, now()
       FROM unnest($1::text[], $2::text[], $3::text[]) AS t(phone, display_phone, name)
       ON CONFLICT (normalized_phone) DO UPDATE SET
         display_phone = EXCLUDED.display_phone,
         name = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
         ksb_only = false,
         updated_at = now()
       RETURNING id, normalized_phone`,
      [phones, displayPhones, names, batchId]
    );
    for (const row of rows.rows) result.set(row.normalized_phone, row.id);
  }
  return result;
}

async function bulkUpsertCsAgents(
  client: TransactionClient,
  orders: NormalizedDailyOrder[]
): Promise<Map<string, number>> {
  const names = [...new Set(orders.map((order) => order.csName).filter((name): name is string => Boolean(name)))];
  const result = new Map<string, number>();
  for (const group of chunk(names, BATCH_SIZE)) {
    const rows = await query<{ id: number; normalized_name: string }>(
      client,
      `INSERT INTO cs_agents (name, normalized_name)
       SELECT n, n FROM unnest($1::text[]) AS t(n)
       ON CONFLICT (normalized_name) DO UPDATE SET active = true
       RETURNING id, normalized_name`,
      [group]
    );
    for (const row of rows.rows) result.set(row.normalized_name, row.id);
  }
  return result;
}

async function bulkUpsertOrders(
  client: TransactionClient,
  orders: NormalizedDailyOrder[],
  customerIdByPhone: Map<string, number>,
  csIdByName: Map<string, number>,
  batchId: number
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const group of chunk(orders, BATCH_SIZE)) {
    const keys = group.map((order) => order.sourceOrderKey);
    const customerIds = group.map((order) => customerIdByPhone.get(order.normalizedPhone) ?? null);
    const dates = group.map((order) => order.orderDate);
    const totals = group.map((order) => order.orderTotal.toString());
    const workspaceTotals = group.map((order) => (order.workspaceTotal > 0n ? order.workspaceTotal : order.orderTotal).toString());
    const platforms = group.map((order) => order.platform || null);
    const divisions = group.map((order) => order.division || null);
    const paymentMethods = group.map((order) => order.paymentMethod || null);
    const partners = group.map((order) => order.partner || null);
    const csIds = group.map((order) => (order.csName ? csIdByName.get(order.csName) ?? null : null));
    const memos = group.map((order) => order.memo || null);
    const fingerprints = group.map((order) => createOrderFingerprint({
      source: "DATABASE_ALL",
      orderDate: order.orderDate,
      normalizedPhone: order.normalizedPhone,
      customerName: order.customerName,
      csName: order.csName,
      total: order.workspaceTotal > 0n ? order.workspaceTotal : order.orderTotal,
      items: order.items.map((item) => ({ product: item.rawProductName, qty: item.qty, amount: item.amount })),
    }));

    const rows = await query<{ id: string; source_order_key: string }>(
      client,
      `INSERT INTO orders (
         source_order_key, customer_id, order_date, order_total, workspace_total, platform, division,
         payment_method, partner, cs_id, memo, source_batch_id, deterministic_fingerprint,
         transaction_status, is_crm_transaction, crm_inclusion_reason, crm_mapping_version,
         city, hub, sales_type, shipping_cost, packing_cost, discount, admin_cod,
         crm_marketing_cost, order_closing_count, updated_at
       )
       SELECT key, customer_id, order_date::date, total::bigint, workspace_total::bigint, platform, division,
         payment_method, partner, cs_id, memo, $13, fingerprint,
         transaction_status::crm_transaction_status, is_crm, inclusion_reason, mapping_version,
         city, hub, sales_type, shipping::bigint, packing::bigint, discount::bigint, admin_cod::bigint,
         marketing::bigint, closing_count, now()
       -- URUTAN CAST WAJIB SEJAJAR DENGAN DAFTAR ALIAS DI BAWAHNYA.
       -- Regresi yang pernah terjadi (commit 026768a): kolom workspace_total
       -- disisipkan di posisi ke-5 tanpa menggeser daftar cast, sehingga
       -- partner (text) kebagian ::int[] dan cs_id (integer) kebagian
       -- ::text[] -- import gagal dengan "column cs_id is of type integer but
       -- expression is of type text". Kalau menambah kolom lagi, sisipkan cast
       -- pada POSISI yang sama dengan aliasnya. Dijaga oleh
       -- tests/import-order-column-alignment.test.ts.
       FROM unnest(
         $1::text[],  $2::int[],   $3::text[],  $4::text[],  $5::text[],  $6::text[],
         $7::text[],  $8::text[],  $9::text[],  $10::int[],  $11::text[], $12::text[],
         $14::text[], $15::bool[], $16::text[], $17::text[], $18::text[], $19::text[],
         $20::text[], $21::text[], $22::text[], $23::text[], $24::text[], $25::text[], $26::int[]
       ) AS t(key,     customer_id, order_date,  total,       workspace_total, platform,
         division,     payment_method, partner,  cs_id,       memo,        fingerprint,
         transaction_status, is_crm,  inclusion_reason, mapping_version, city, hub,
         sales_type,   shipping,    packing,     discount,    admin_cod,   marketing, closing_count)
       ON CONFLICT (source_order_key) DO UPDATE SET
         customer_id = EXCLUDED.customer_id,
         order_date = EXCLUDED.order_date,
         order_total = EXCLUDED.order_total,
         workspace_total = EXCLUDED.workspace_total,
         platform = EXCLUDED.platform,
         division = EXCLUDED.division,
         payment_method = EXCLUDED.payment_method,
         partner = EXCLUDED.partner,
         cs_id = EXCLUDED.cs_id,
         memo = EXCLUDED.memo,
         source_batch_id = EXCLUDED.source_batch_id,
         deterministic_fingerprint = EXCLUDED.deterministic_fingerprint,
         transaction_status = EXCLUDED.transaction_status,
         is_crm_transaction = EXCLUDED.is_crm_transaction,
         crm_inclusion_reason = EXCLUDED.crm_inclusion_reason,
         crm_mapping_version = EXCLUDED.crm_mapping_version,
         city = EXCLUDED.city, hub = EXCLUDED.hub, sales_type = EXCLUDED.sales_type,
         shipping_cost = EXCLUDED.shipping_cost, packing_cost = EXCLUDED.packing_cost,
         discount = EXCLUDED.discount, admin_cod = EXCLUDED.admin_cod,
         crm_marketing_cost = EXCLUDED.crm_marketing_cost,
         order_closing_count = EXCLUDED.order_closing_count,
         updated_at = now()
       RETURNING id::text, source_order_key`,
      [
        keys, customerIds, dates, totals, workspaceTotals, platforms, divisions, paymentMethods, partners,
        csIds, memos, fingerprints, batchId,
        group.map((order) => order.transactionStatus),
        group.map((order) => order.crmClassification.included),
        group.map((order) => order.crmClassification.inclusionReason),
        group.map((order) => order.crmClassification.mappingVersion),
        group.map((order) => order.city || null),
        group.map((order) => order.hub || null),
        group.map((order) => order.salesType || null),
        group.map((order) => order.shippingCost.toString()),
        group.map((order) => order.packingCost.toString()),
        group.map((order) => order.discount.toString()),
        group.map((order) => order.adminCod.toString()),
        group.map((order) => order.crmMarketingCost.toString()),
        group.map((order) => order.orderClosingCount),
      ]
    );
    for (const row of rows.rows) result.set(row.source_order_key, row.id);
  }
  return result;
}

async function bulkInsertItems(
  client: TransactionClient,
  orders: NormalizedDailyOrder[],
  orderIdByKey: Map<string, string>,
  products: Map<CanonicalProductCode, { id: number }>
): Promise<number> {
  const unknown = products.get("UNKNOWN");
  if (!unknown) throw new Error("Produk UNKNOWN tidak tersedia");
  const hppRows = await query<{ product_id: number; unit_hpp: string; effective_from: string; effective_to: string | null }>(
    client,
    "SELECT product_id, unit_hpp::text, effective_from::text, effective_to::text FROM product_hpp_history ORDER BY product_id, effective_from"
  );
  const hppByProduct = new Map<number, typeof hppRows.rows>();
  for (const row of hppRows.rows) hppByProduct.set(row.product_id, [...(hppByProduct.get(row.product_id) ?? []), row]);

  const seenKeys = new Set<string>();
  const items: {
    key: string; orderId: string; productId: number; rawName: string;
    externalId: string | null; qty: string | null; amount: string;
    isBonus: boolean; identityConfidence: string; sourceRowNumber: number;
    sellingPrice: string; gross: string; unitHpp: string | null; totalHpp: string | null;
    hppStatus: "KNOWN" | "UNKNOWN"; allocatedDiscount: string; allocatedPacking: string;
    allocatedAdminCod: string; allocatedCom: string; netRevenue: string;
  }[] = [];
  for (const order of orders) {
    const orderId = orderIdByKey.get(order.sourceOrderKey);
    if (!orderId) throw new Error(`Order id tidak ditemukan untuk ${order.sourceOrderKey}`);
    const uniqueItems = order.items.filter((item) => {
      if (seenKeys.has(item.sourceItemKey)) return false;
      seenKeys.add(item.sourceItemKey);
      return true;
    });
    const prepared = uniqueItems.map((item) => {
      const resolved = products.get(item.productFlags.code) ?? unknown;
      const hpp = hppByProduct.get(resolved.id)?.find(
        (candidate) => candidate.effective_from <= order.orderDate && (!candidate.effective_to || order.orderDate < candidate.effective_to)
      );
      const quantity = quantityAsBigInt(item.qty);
      return { item, resolved, quantity, unitHpp: hpp ? BigInt(hpp.unit_hpp) : null };
    });
    const allocated = allocateOrderComponents(
      prepared.map(({ item, quantity, unitHpp }) => ({ key: item.sourceItemKey, gross: item.amount, quantity, unitHpp })),
      { discount: order.discount, packing: order.packingCost, adminCod: order.adminCod, voucher: 0n, com: order.crmMarketingCost }
    );
    const allocationByKey = new Map(allocated.map((row) => [row.key, row]));

    for (const { item, resolved, quantity, unitHpp } of prepared) {
      const allocation = allocationByKey.get(item.sourceItemKey)!;
      items.push({
        key: item.sourceItemKey,
        orderId,
        productId: resolved.id,
        rawName: item.rawProductName,
        externalId: item.externalId,
        qty: item.qty,
        amount: item.amount.toString(),
        isBonus: item.isBonus,
        identityConfidence: item.identityConfidence,
        sourceRowNumber: item.sourceRowNumber,
        sellingPrice: quantity > 0n ? (item.amount / quantity).toString() : item.amount.toString(),
        gross: item.amount.toString(),
        unitHpp: unitHpp?.toString() ?? null,
        totalHpp: allocation.totalHpp?.toString() ?? null,
        hppStatus: allocation.hppStatus,
        allocatedDiscount: allocation.allocatedDiscount.toString(),
        allocatedPacking: allocation.allocatedPacking.toString(),
        allocatedAdminCod: allocation.allocatedAdminCod.toString(),
        allocatedCom: allocation.allocatedCom.toString(),
        netRevenue: allocation.netRevenue.toString(),
      });
    }
  }

  for (const group of chunk(items, BATCH_SIZE)) {
    await query(
      client,
      `INSERT INTO order_items (
         source_item_key, order_id, product_id, raw_product_name, external_id,
         qty, amount, is_bonus, identity_confidence, source_row_number,
         selling_price, gross_item_value, unit_hpp_snapshot, total_hpp, hpp_status,
         allocation_sequence, allocated_discount, allocated_packing, allocated_admin_cod,
         allocated_com, net_item_revenue
       )
       SELECT key, order_id::bigint, product_id, raw_name, external_id,
         NULLIF(qty, '')::numeric, amount::bigint, is_bonus, identity_confidence::identity_confidence, source_row_number,
         selling_price::bigint, gross::bigint, NULLIF(unit_hpp, '')::bigint, NULLIF(total_hpp, '')::bigint,
         hpp_status::crm_hpp_status, source_row_number, allocated_discount::bigint, allocated_packing::bigint,
         allocated_admin_cod::bigint, allocated_com::bigint, net_revenue::bigint
       FROM unnest(
         $1::text[], $2::text[], $3::int[], $4::text[], $5::text[],
         $6::text[], $7::text[], $8::bool[], $9::text[], $10::int[],
         $11::text[], $12::text[], $13::text[], $14::text[], $15::text[],
         $16::text[], $17::text[], $18::text[], $19::text[], $20::text[]
       ) AS t(key, order_id, product_id, raw_name, external_id, qty, amount, is_bonus,
         identity_confidence, source_row_number, selling_price, gross, unit_hpp, total_hpp,
         hpp_status, allocated_discount, allocated_packing, allocated_admin_cod, allocated_com, net_revenue)`,
      [
        group.map((i) => i.key), group.map((i) => i.orderId), group.map((i) => i.productId),
        group.map((i) => i.rawName), group.map((i) => i.externalId), group.map((i) => i.qty),
        group.map((i) => i.amount), group.map((i) => i.isBonus), group.map((i) => i.identityConfidence),
        group.map((i) => i.sourceRowNumber), group.map((i) => i.sellingPrice), group.map((i) => i.gross),
        group.map((i) => i.unitHpp), group.map((i) => i.totalHpp), group.map((i) => i.hppStatus),
        group.map((i) => i.allocatedDiscount), group.map((i) => i.allocatedPacking),
        group.map((i) => i.allocatedAdminCod), group.map((i) => i.allocatedCom), group.map((i) => i.netRevenue),
      ]
    );
  }
  return items.length;
}

function quantityAsBigInt(value: string | null): bigint {
  if (!value) return 1n;
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) return BigInt(normalized);
  if (/^\d+\.0+$/.test(normalized)) return BigInt(normalized.slice(0, normalized.indexOf(".")));
  throw new Error(`Qty non-integer tidak didukung untuk snapshot HPP: ${value}`);
}

/**
 * Canonical KSB (Legacy backfill + ekstraksi Database All), dipanggil dari kedua
 * jalur (commitDatabaseAllImport di sini, dan scripts/import-legacy-ksb.ts).
 * Idempoten murni lewat unique index ksb_transactions_source_key_uq — transaksi
 * yang sama dari sumber manapun otomatis DO NOTHING pada percobaan kedua.
 */
export async function upsertKsbCanonical(
  client: TransactionClient,
  transactions: NormalizedKsbTransaction[],
  batchId: number
): Promise<{ inserted: number; skippedExisting: number }> {
  if (!transactions.length) return { inserted: 0, skippedExisting: 0 };
  await bulkUpsertCustomersFromKsb(client, transactions, batchId);
  return bulkUpsertKsbTransactions(client, transactions, batchId);
}

/** Pastikan baris `customers` ada untuk phone yang HANYA muncul lewat KSB (belum
 *  pernah tersentuh bulkUpsertCustomers Database All). Tidak menimpa customer
 *  yang sudah ada (ON CONFLICT DO NOTHING) — status ksb_only existing tidak diubah
 *  di sini, biar bulkUpsertCustomers (order Probetes) yang jadi satu-satunya
 *  tempat ksb_only di-set false. */
async function bulkUpsertCustomersFromKsb(
  client: TransactionClient,
  transactions: NormalizedKsbTransaction[],
  batchId: number
): Promise<void> {
  const byPhone = new Map<string, string | null>();
  for (const t of transactions) {
    if (!byPhone.has(t.normalizedPhone)) byPhone.set(t.normalizedPhone, t.customerName || null);
  }
  for (const group of chunk([...byPhone.entries()], BATCH_SIZE)) {
    await query(
      client,
      `INSERT INTO customers (normalized_phone, name, ksb_only, first_seen_batch_id, updated_at)
       SELECT phone, name, true, $3, now()
       FROM unnest($1::text[], $2::text[]) AS t(phone, name)
       ON CONFLICT (normalized_phone) DO NOTHING`,
      [group.map(([phone]) => phone), group.map(([, name]) => name), batchId]
    );
  }
}

async function bulkUpsertKsbTransactions(
  client: TransactionClient,
  transactions: NormalizedKsbTransaction[],
  batchId: number
): Promise<{ inserted: number; skippedExisting: number }> {
  let inserted = 0;
  for (const group of chunk(transactions, BATCH_SIZE)) {
    const result = await query(
      client,
      `INSERT INTO ksb_transactions (
         source_transaction_key, customer_phone, customer_id, transaction_date,
         product_name, amount, source_batch_id
       )
       SELECT t.key, t.phone, c.id, t.date::date, t.product, t.amount::bigint, $6
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
         AS t(key, phone, date, product, amount)
       LEFT JOIN customers c ON c.normalized_phone = t.phone
       ON CONFLICT (source_transaction_key) DO NOTHING`,
      [
        group.map((t) => t.sourceKey),
        group.map((t) => t.normalizedPhone),
        group.map((t) => t.transactionDate),
        group.map((t) => t.productName),
        group.map((t) => t.amount.toString()),
        batchId,
      ]
    );
    inserted += result.rowCount ?? 0;
  }
  return { inserted, skippedExisting: transactions.length - inserted };
}

// Database All = FULL SNAPSHOT (docs/04-DESIGN.md §2.3): baris yang hilang dari
// upload baru tetap tersimpan dengan source_batch_id lama, tidak dihapus. RFM dan
// cluster karena itu wajib dihitung dari SELURUH tabel orders, bukan hanya order
// milik batch yang baru di-commit — kalau tidak, customer yang tidak muncul di
// file terbaru akan hilang dari RFM/cluster current walau order-nya masih ada.
//
// Basis universe = customers (bukan orders): customer yang 100% murni KSB (tidak
// pernah punya order Probetes sama sekali) tetap harus dapat baris di sini supaya
// bisa dievaluasi Cluster B — rule "hitung dari SELURUH ksb_transactions". Mereka
// akan punya frequency=0/monetary=0 (bukan NULL row yang hilang begitu saja).
// yacona_frequency dihitung dari SELURUH ksb_transactions tanpa filter source/
// is_active (Q17, sekarang berlaku juga untuk jalur KSB — Legacy + Database All).
//
// Populasi CRM final (docs/07-OPEN-QUESTIONS.md): customer_rfm_current HANYA
// berisi customer dengan nama non-kosong — nama kosong tidak lagi bisa terjadi
// untuk import baru (parser sudah menolaknya di sumber, lihat MISSING_NAME di
// database-all-parser.ts/ksb-parser.ts), guard di sini murni pertahanan kedua.
export async function rebuildRfm(client: TransactionClient, asOfDate: string) {
  await query(client, "DELETE FROM customer_rfm_current");
  await query(
    client,
    `INSERT INTO customer_rfm_current (
       customer_id, as_of_date, recency_days, frequency, monetary,
       first_order_date, last_order_date, avg_order_value, customer_age_days,
       yacona_frequency, cohort_month, updated_at
     )
     WITH order_agg AS (
       SELECT customer_id, COUNT(*)::integer AS frequency, SUM(order_total)::bigint AS monetary,
              MIN(order_date) AS first_order_date, MAX(order_date) AS last_order_date
       FROM orders
       GROUP BY customer_id
     ),
     ksb_freq AS (
       SELECT customer_phone, COUNT(DISTINCT transaction_date)::integer AS freq
       FROM ksb_transactions
       GROUP BY customer_phone
     )
     SELECT
       c.id, $1::date,
       CASE WHEN oa.last_order_date IS NOT NULL THEN $1::date - oa.last_order_date END,
       COALESCE(oa.frequency, 0)::integer,
       COALESCE(oa.monetary, 0)::bigint,
       oa.first_order_date, oa.last_order_date,
       CASE WHEN oa.frequency > 0 THEN (oa.monetary / oa.frequency)::bigint END,
       CASE WHEN oa.first_order_date IS NOT NULL THEN $1::date - oa.first_order_date END,
       COALESCE(kf.freq, 0)::integer,
       CASE WHEN oa.first_order_date IS NOT NULL THEN date_trunc('month', oa.first_order_date)::date END,
       now()
     FROM customers c
     LEFT JOIN order_agg oa ON oa.customer_id = c.id
     LEFT JOIN ksb_freq kf ON kf.customer_phone = c.normalized_phone
     WHERE (oa.customer_id IS NOT NULL OR kf.customer_phone IS NOT NULL)
       AND c.name IS NOT NULL AND btrim(c.name) <> ''`,
    [asOfDate]
  );
}

// Didorong dari customer_rfm_current (bukan langsung dari orders) supaya customer
// KSB-murni (frequency=0) ikut terevaluasi assignCluster — engine murni sudah
// menangani frequency=0 dengan benar (checkB duluan, lalu YACONA_NON_COHORT),
// tinggal SQL yang harus benar-benar memanggil mereka.
export async function rebuildClusters(client: TransactionClient, batchId: number, asOfDate: string) {
  const rows = await query<{
    customer_id: number;
    order_date: string | null;
    amount: string | null;
    is_bonus: boolean | null;
    product_code: CanonicalProductCode | null;
    has_group: GroupStatus;
    yacona_frequency: number;
  }>(
    client,
    `SELECT
       r.customer_id, o.order_date::text, oi.amount::text, oi.is_bonus,
       p.code AS product_code,
       COALESCE(gm.status, 'NOT_GROUPED') AS has_group,
       r.yacona_frequency
     FROM customer_rfm_current r
     LEFT JOIN customer_group_memberships gm ON gm.customer_id = r.customer_id
     LEFT JOIN orders o ON o.customer_id = r.customer_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN products p ON p.id = oi.product_id
     ORDER BY r.customer_id, o.order_date, oi.id`,
    []
  );

  const byCustomer = new Map<
    number,
    { orders: Map<string, RawOrderInput>; hasGroup: GroupStatus; yaconaFrequency: number }
  >();
  for (const row of rows.rows) {
    const customer = byCustomer.get(row.customer_id) ?? {
      orders: new Map(),
      hasGroup: row.has_group,
      yaconaFrequency: row.yacona_frequency,
    };
    if (row.order_date !== null && row.amount !== null && row.product_code !== null) {
      const order = customer.orders.get(row.order_date) ?? { date: row.order_date, items: [] };
      order.items.push({
        amount: BigInt(row.amount),
        isBonus: row.is_bonus ?? false,
        productFlags: productFlagsForCode(row.product_code),
      });
      customer.orders.set(row.order_date, order);
    }
    byCustomer.set(row.customer_id, customer);
  }

  const existing = await query<{ customer_id: number; cluster_code: string }>(
    client,
    "SELECT customer_id, cluster_code FROM customer_cluster_current"
  );
  const existingMap = new Map(existing.rows.map((row) => [row.customer_id, row.cluster_code]));
  await query(client, "DELETE FROM customer_cluster_current");

  const assignments: { customerId: number; clusterCode: string; reason: string }[] = [];
  for (const [customerId, customer] of byCustomer) {
    const features = buildCustomerFeatures(
      [...customer.orders.values()],
      customer.hasGroup,
      customer.yaconaFrequency,
      { asOfDate, ruleVersion: RULE_VERSION }
    );
    const assignment = assignCluster(features, { asOfDate, ruleVersion: RULE_VERSION });
    assignments.push({
      customerId,
      clusterCode: assignment.clusterCode,
      reason: JSON.stringify({ ...assignment.reason, asOfDate, ruleVersion: RULE_VERSION }),
    });
  }

  for (const group of chunk(assignments, BATCH_SIZE)) {
    await query(
      client,
      `INSERT INTO customer_cluster_current (customer_id, cluster_code, rule_version, reason, assigned_at)
       SELECT customer_id, cluster_code, $4, reason::jsonb, now()
       FROM unnest($1::int[], $2::text[], $3::text[]) AS t(customer_id, cluster_code, reason)`,
      [
        group.map((a) => a.customerId),
        group.map((a) => a.clusterCode),
        group.map((a) => a.reason),
        RULE_VERSION,
      ]
    );
  }

  const changed = assignments.filter((a) => existingMap.get(a.customerId) !== a.clusterCode);
  if (changed.length) {
    const changedIds = changed.map((a) => a.customerId);
    await query(
      client,
      "UPDATE customer_cluster_history SET valid_to = now() WHERE customer_id = ANY($1::int[]) AND valid_to IS NULL",
      [changedIds]
    );
    for (const group of chunk(changed, BATCH_SIZE)) {
      await query(
        client,
        `INSERT INTO customer_cluster_history (customer_id, cluster_code, valid_from, rule_version, reason, batch_id)
         SELECT customer_id, cluster_code, now(), $4, reason::jsonb, $5
         FROM unnest($1::int[], $2::text[], $3::text[]) AS t(customer_id, cluster_code, reason)`,
        [
          group.map((a) => a.customerId),
          group.map((a) => a.clusterCode),
          group.map((a) => a.reason),
          RULE_VERSION,
          batchId,
        ]
      );
    }
  }

  await query(
    client,
    "UPDATE customer_cluster_history SET valid_to = now() WHERE valid_to IS NULL AND customer_id <> ALL($1::int[])",
    [[...byCustomer.keys()]]
  );
}

/**
 * Rekalkulasi cluster SATU customer — dipakai setelah CRM mengubah status
 * membership dari Customer All. Rule engine sama persis dengan rebuildClusters
 * (buildCustomerFeatures + assignCluster), hanya bentuk fetch/persist SQL yang
 * beda (single-row, bukan batched) karena skalanya beda jauh (1 vs puluhan ribu).
 */
export async function recalculateClusterForCustomer(
  client: TransactionClient,
  customerId: number
): Promise<{ clusterCode: string } | null> {
  const asOfDateRow = await query<{ as_of_date: string | null }>(
    client,
    "SELECT as_of_date::text FROM import_batches WHERE source_type = 'DATABASE_ALL' AND is_active = true LIMIT 1"
  );
  const asOfDate = asOfDateRow.rows[0]?.as_of_date;
  if (!asOfDate) return null; // Belum ada Database All aktif — belum ada as_of_date untuk analitik.

  const rows = await query<{
    order_date: string | null;
    amount: string | null;
    is_bonus: boolean | null;
    product_code: CanonicalProductCode | null;
    has_group: GroupStatus;
    yacona_frequency: number;
  }>(
    client,
    `SELECT
       o.order_date::text, oi.amount::text, oi.is_bonus,
       p.code AS product_code,
       COALESCE(gm.status, 'NOT_GROUPED') AS has_group,
       COALESCE(r.yacona_frequency, 0) AS yacona_frequency
     FROM customer_rfm_current r
     LEFT JOIN customer_group_memberships gm ON gm.customer_id = r.customer_id
     LEFT JOIN orders o ON o.customer_id = r.customer_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE r.customer_id = $1
     ORDER BY o.order_date, oi.id`,
    [customerId]
  );
  if (!rows.rows.length) return null; // Customer tanpa baris customer_rfm_current — belum pernah di-rebuild.

  const orders = new Map<string, RawOrderInput>();
  for (const row of rows.rows) {
    if (row.order_date !== null && row.amount !== null && row.product_code !== null) {
      const order = orders.get(row.order_date) ?? { date: row.order_date, items: [] };
      order.items.push({
        amount: BigInt(row.amount),
        isBonus: row.is_bonus ?? false,
        productFlags: productFlagsForCode(row.product_code),
      });
      orders.set(row.order_date, order);
    }
  }
  const hasGroup = rows.rows[0]!.has_group;
  const yaconaFrequency = rows.rows[0]!.yacona_frequency;

  const features = buildCustomerFeatures(
    [...orders.values()],
    hasGroup,
    yaconaFrequency,
    { asOfDate, ruleVersion: RULE_VERSION }
  );
  const assignment = assignCluster(features, { asOfDate, ruleVersion: RULE_VERSION });
  const reason = JSON.stringify({ ...assignment.reason, asOfDate, ruleVersion: RULE_VERSION });

  const existing = await query<{ cluster_code: string }>(
    client,
    "SELECT cluster_code FROM customer_cluster_current WHERE customer_id = $1",
    [customerId]
  );
  const previousCode = existing.rows[0]?.cluster_code ?? null;

  await query(
    client,
    `INSERT INTO customer_cluster_current (customer_id, cluster_code, rule_version, reason, assigned_at)
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT (customer_id) DO UPDATE SET
       cluster_code = EXCLUDED.cluster_code, rule_version = EXCLUDED.rule_version,
       reason = EXCLUDED.reason, assigned_at = now()`,
    [customerId, assignment.clusterCode, RULE_VERSION, reason]
  );

  if (previousCode !== assignment.clusterCode) {
    await query(
      client,
      "UPDATE customer_cluster_history SET valid_to = now() WHERE customer_id = $1 AND valid_to IS NULL",
      [customerId]
    );
    await query(
      client,
      `INSERT INTO customer_cluster_history (customer_id, cluster_code, valid_from, rule_version, reason, batch_id)
       VALUES ($1, $2, now(), $3, $4::jsonb, NULL)`,
      [customerId, assignment.clusterCode, RULE_VERSION, reason]
    );
  }

  return { clusterCode: assignment.clusterCode };
}

function collectIssues(
  parsed: DatabaseAllParseResult
): Array<{ rowNumber: number; code: ImportIssueCode; detail: Record<string, unknown> }> {
  const issues: Array<{ rowNumber: number; code: ImportIssueCode; detail: Record<string, unknown> }> = [];
  for (const excluded of parsed.excluded) {
    for (const code of excluded.codes) {
      if (code === "MISSING_PHONE" || code === "INVALID_PHONE" || code === "INVALID_DATE" || code === "MISSING_NAME") {
        issues.push({ rowNumber: excluded.rowNumber, code, detail: { rowNumber: excluded.rowNumber } });
      }
    }
  }
  for (const order of parsed.orders) {
    const seen = new Set<string>();
    for (const item of order.items) {
      if (item.productFlags.code === "UNKNOWN") {
        issues.push({ rowNumber: item.sourceRowNumber, code: "UNKNOWN_PRODUCT", detail: { rawProductName: item.rawProductName } });
      }
      if (!item.externalId) {
        issues.push({ rowNumber: item.sourceRowNumber, code: "MISSING_ORDER_ID", detail: { sourceOrderKey: order.sourceOrderKey } });
      }
      if (seen.has(item.sourceItemKey)) {
        issues.push({ rowNumber: item.sourceRowNumber, code: "AMOUNT_CONFLICT", detail: { sourceItemKey: item.sourceItemKey } });
      }
      seen.add(item.sourceItemKey);
    }
  }
  return issues;
}

async function loadStagedRows(batchId: number): Promise<SourceRow[]> {
  const rows = await getDb()
    .select({ rowNumber: stagingImportRows.rowNumber, values: stagingImportRows.rawData })
    .from(stagingImportRows)
    .where(eq(stagingImportRows.importBatchId, batchId))
    .orderBy(stagingImportRows.rowNumber);
  return rows;
}

async function getDatabaseAllBatch(batchId: number) {
  const [batch] = await getDb()
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.sourceType, "DATABASE_ALL")))
    .limit(1);
  if (!batch) throw new Error("Import batch tidak ditemukan");
  return batch;
}

function buildPreview(
  batch: { id: number; filename: string; status: string },
  parsed: DatabaseAllParseResult,
  needsReviewRows: number,
  duplicate: boolean
): ImportPreview {
  const issueCounts: ImportPreview["issueCounts"] = {};
  for (const issue of collectIssues(parsed)) {
    issueCounts[issue.code] = (issueCounts[issue.code] ?? 0) + 1;
  }
  return {
    batchId: batch.id,
    filename: batch.filename,
    duplicate,
    status: "STAGED",
    asOfDate: parsed.asOfDate,
    totalRows: parsed.totalSourceRows,
    validRows: parsed.totalSourceRows - parsed.excluded.length,
    excludedRows: parsed.excluded.length,
    needsReviewRows,
    orderCount: parsed.orders.length,
    customerCount: new Set(parsed.orders.map((order) => order.normalizedPhone)).size,
    issueCounts,
  };
}

/**
 * Batch yang sudah COMPLETED tidak di-parse ulang — staging row-nya sudah
 * jadi canonical. Angka customer/order dan issue dibaca dari hasil commit
 * supaya preview upload duplikat menampilkan kondisi nyata, bukan nol.
 */
async function previewForCompletedBatch(
  batch: Awaited<ReturnType<typeof getDatabaseAllBatch>>
): Promise<ImportPreview> {
  const db = getDb();
  const [counts, issues] = await Promise.all([
    db.execute<{ customers: string; orders: string }>(sql`
      SELECT
        COUNT(DISTINCT o.customer_id)::text AS customers,
        COUNT(DISTINCT o.id)::text AS orders
      FROM orders o
      WHERE o.source_batch_id = ${batch.id}
    `),
    db.execute<{ issue_type: ImportIssueCode; total: string }>(sql`
      SELECT issue_type::text AS issue_type, COUNT(*)::text AS total
      FROM data_quality_issues
      WHERE import_batch_id = ${batch.id}
      GROUP BY issue_type
    `),
  ]);

  const issueCounts: ImportPreview["issueCounts"] = {};
  for (const row of issues.rows) issueCounts[row.issue_type] = Number(row.total);

  return {
    batchId: batch.id,
    filename: batch.filename,
    duplicate: true,
    status: "COMPLETED",
    asOfDate: batch.asOfDate,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    excludedRows: batch.excludedRows,
    needsReviewRows: batch.needsReviewRows,
    orderCount: Number(counts.rows[0]?.orders ?? 0),
    customerCount: Number(counts.rows[0]?.customers ?? 0),
    issueCounts,
  };
}

async function completedCommitResult(batchId: number): Promise<ImportCommitResult> {
  return withTransaction((client) => completedCommitResultWithClient(client, batchId));
}

async function completedCommitResultWithClient(
  client: TransactionClient,
  batchId: number
): Promise<ImportCommitResult> {
  const result = await query<{
    as_of_date: string; excluded_rows: number; needs_review_rows: number;
    customers: string; orders: string; items: string;
  }>(
    client,
    `SELECT b.as_of_date::text, b.excluded_rows, b.needs_review_rows,
       COUNT(DISTINCT o.customer_id)::text AS customers,
       COUNT(DISTINCT o.id)::text AS orders,
       COUNT(oi.id)::text AS items
     FROM import_batches b
     LEFT JOIN orders o ON o.source_batch_id = b.id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE b.id = $1
     GROUP BY b.id`,
    [batchId]
  );
  const row = result.rows[0];
  if (!row?.as_of_date) throw new Error("Batch selesai tanpa as_of_date");
  return {
    batchId,
    asOfDate: row.as_of_date,
    customers: Number(row.customers),
    orders: Number(row.orders),
    items: Number(row.items),
    excludedRows: row.excluded_rows,
    needsReviewRows: row.needs_review_rows,
  };
}

async function loadProductMap(client: TransactionClient) {
  const result = await query<{ id: number; code: CanonicalProductCode }>(
    client,
    "SELECT id, code FROM products WHERE active = true"
  );
  return new Map(result.rows.map((row) => [row.code, row]));
}

async function query<T extends QueryResultRow = Record<string, unknown>>(
  client: TransactionClient,
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> {
  return client.query<T>(text, values);
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}
