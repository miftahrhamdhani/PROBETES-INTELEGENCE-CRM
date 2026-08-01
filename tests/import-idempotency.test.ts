/**
 * Skenario 21 (docs/02-CLUSTER-RULES.md §9): upload file sama 2x -> state DB identik.
 *
 * Dipecah dua lapis:
 *  1. `describe` di bawah — jalan selalu di CI, tanpa DB. Membuktikan dua hal yang
 *     membuat re-upload idempoten: parser deterministik (source key stabil) dan
 *     skema exact-replacement (unique index di setiap source key).
 *  2. `describeIntegration` — commit sungguhan ke Neon, skip default.
 *
 * PERINGATAN integration test: rebuildRfm/rebuildClusters menghitung ulang
 * customer_rfm_current dan customer_cluster_current dari SELURUH tabel orders
 * (full snapshot, lihat orchestrator.ts), bukan hanya order milik batch ini. Commit
 * di test ini karena itu membangun ulang RFM/cluster untuk SEMUA customer di
 * database target — lambat di DB besar. JANGAN jalankan terhadap DATABASE_URL
 * produksi. Jalankan eksplisit dengan:
 *   RUN_DB_INTEGRATION_TESTS=1 npx vitest run tests/import-idempotency.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import { Client } from "@neondatabase/serverless";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  customers,
  importBatches,
  orderItems,
  orders,
  stagingImportRows,
} from "@/server/db/schema";
import { parseDatabaseAll } from "@/server/import/database-all-parser";
import {
  commitDatabaseAllImport,
  initDatabaseAllImport,
  stageDatabaseAllRows,
  validateDatabaseAllImport,
} from "@/server/import/orchestrator";
import type { SourceRow } from "@/server/import/types";

const TEST_PHONE = "6281200000001";
const TEST_FILENAME = "idempotency-test.xlsx";

const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeIntegration = RUN ? describe : describe.skip;

const BASE = {
  "Customer": "Test Idempotency",
  "No. HP": "0812 0000 0001",
  "CS": "Test CS",
  "DIVISI": "CRM",
  "Platform": "Meta",
  "pembayaran ": "TRANSFER",
  "Mitra": "UP DM",
  "Memo": "TEST",
};

function rows(hashSuffix: string): SourceRow[] {
  return [
    {
      rowNumber: 3,
      values: {
        ...BASE,
        "Tanggal Pesanan": "01/07/2026",
        "Produk 1": "Ebook 90",
        "Qty 1": 1,
        "Nilai Produk": 89_000,
        idpesan: `TEST-${hashSuffix}`,
      },
    },
  ];
}

/** Dua baris independen (bukan referensi objek yang sama) untuk membuktikan
 * determinisme parser bukan sekadar identitas objek. */
function fileRows(): SourceRow[] {
  return [
    {
      rowNumber: 2,
      values: {
        ...BASE,
        "Tanggal Pesanan": "05/01/2026",
        "Produk 1": "Ebook 90",
        "Qty 1": 1,
        "Nilai Produk": 89_000,
        idpesan: "ORDER-A",
      },
    },
    {
      rowNumber: 3,
      values: {
        ...BASE,
        "No. HP": "0813 1111 2222",
        "Tanggal Pesanan": "06/01/2026",
        "Produk 1": "Probetes Herbal 24",
        "Qty 1": 2,
        "Nilai Produk": 890_000,
        idpesan: "ORDER-B",
      },
    },
  ];
}

/** Unique index (bukan index biasa) atas kolom tertentu di sebuah tabel Drizzle. */
function hasUniqueIndexOn(table: Parameters<typeof getTableConfig>[0], columns: string[]) {
  const config = getTableConfig(table);
  const fromIndexes = config.indexes.some(
    (idx) =>
      idx.config.unique === true &&
      idx.config.columns.map((c) => ("name" in c ? c.name : "")).join(",") === columns.join(",")
  );
  const fromConstraints = config.uniqueConstraints.some(
    (uq) => uq.columns.map((c) => c.name).join(",") === columns.join(",")
  );
  return fromIndexes || fromConstraints;
}

describe("21. Import idempotency (tanpa DB)", () => {
  it("parser deterministik: file sama diparse 2x -> hasil identik, source key sama", () => {
    const first = parseDatabaseAll(fileRows());
    const second = parseDatabaseAll(fileRows());

    expect(second).toEqual(first);
    expect(first.orders.map((o) => o.sourceOrderKey)).toEqual([
      "2026-01-05|6281200000001",
      "2026-01-06|6281311112222",
    ]);
    expect(second.orders.flatMap((o) => o.items.map((i) => i.sourceItemKey))).toEqual(
      first.orders.flatMap((o) => o.items.map((i) => i.sourceItemKey))
    );
    expect(second.asOfDate).toBe(first.asOfDate);
  });

  it("source key tidak bergantung urutan baris di file", () => {
    const normal = parseDatabaseAll(fileRows());
    const reversed = parseDatabaseAll([...fileRows()].reverse());

    expect(reversed.orders.map((o) => o.sourceOrderKey)).toEqual(
      normal.orders.map((o) => o.sourceOrderKey)
    );
    expect(reversed.orders.flatMap((o) => o.items.map((i) => i.sourceItemKey)).sort()).toEqual(
      normal.orders.flatMap((o) => o.items.map((i) => i.sourceItemKey)).sort()
    );
  });

  it("source key stabil walau baris lain ditambahkan", () => {
    const base = parseDatabaseAll(fileRows());
    const extra: SourceRow = {
      rowNumber: 4,
      values: {
        ...BASE,
        "No. HP": "0814 9999 8888",
        "Tanggal Pesanan": "07/01/2026",
        "Produk 1": "Ebook 90",
        "Qty 1": 1,
        "Nilai Produk": 89_000,
        idpesan: "ORDER-C",
      },
    };
    const grown = parseDatabaseAll([...fileRows(), extra]);

    const keyOf = (key: string) => (r: ReturnType<typeof parseDatabaseAll>) =>
      r.orders.find((o) => o.sourceOrderKey === key);
    for (const order of base.orders) {
      expect(keyOf(order.sourceOrderKey)(grown)).toEqual(order);
    }
  });

  it("skema exact-replacement: setiap source key punya unique index", () => {
    // Re-upload menimpa baris lama lewat ON CONFLICT / DELETE by key, bukan
    // menambah duplikat. Tanpa unique index ini idempotensi tidak bisa dijamin.
    expect(hasUniqueIndexOn(orders, ["source_order_key"])).toBe(true);
    expect(hasUniqueIndexOn(orderItems, ["source_item_key"])).toBe(true);
    expect(hasUniqueIndexOn(customers, ["normalized_phone"])).toBe(true);
    expect(hasUniqueIndexOn(stagingImportRows, ["import_batch_id", "row_number"])).toBe(true);
  });

  it("skema exact-replacement: file hash sama tidak bisa jadi dua batch", () => {
    expect(hasUniqueIndexOn(importBatches, ["source_type", "file_hash"])).toBe(true);
  });

  it("order_items dihapus mengikuti order (ON DELETE CASCADE)", () => {
    const fk = getTableConfig(orderItems)
      .foreignKeys.map((f) => f.reference())
      .find((ref) => ref.foreignTable === orders);
    expect(fk?.columns.map((c) => c.name)).toEqual(["order_id"]);
    expect(getTableConfig(orderItems).foreignKeys[0]?.onDelete).toBe("cascade");
  });
});

async function runImport(fileHash: string) {
  const init = await initDatabaseAllImport({
    filename: TEST_FILENAME,
    fileHash,
    totalRows: 1,
  });
  if (!init.duplicate) await stageDatabaseAllRows(init.batchId, rows(fileHash.slice(0, 8)));
  const preview = await validateDatabaseAllImport(init.batchId);
  const commit = await commitDatabaseAllImport(init.batchId);
  return { init, preview, commit };
}

describeIntegration("21. Import idempotency (Neon integration)", () => {
  afterAll(async () => {
    const client = new Client(process.env.DATABASE_URL);
    await client.connect();
    try {
      const batches = await client.query<{ id: number }>(
        "SELECT id FROM import_batches WHERE filename = $1",
        [TEST_FILENAME]
      );
      for (const { id } of batches.rows) {
        await client.query(
          "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE source_batch_id = $1)",
          [id]
        );
        await client.query("DELETE FROM orders WHERE source_batch_id = $1", [id]);
        await client.query("DELETE FROM customer_cluster_history WHERE batch_id = $1", [id]);
        await client.query("DELETE FROM data_quality_issues WHERE import_batch_id = $1", [id]);
        await client.query("DELETE FROM staging_import_rows WHERE import_batch_id = $1", [id]);
        await client.query("DELETE FROM import_batches WHERE id = $1", [id]);
      }
      await client.query(
        "DELETE FROM customer_cluster_current WHERE customer_id IN (SELECT id FROM customers WHERE normalized_phone = $1)",
        [TEST_PHONE]
      );
      await client.query(
        "DELETE FROM customer_rfm_current WHERE customer_id IN (SELECT id FROM customers WHERE normalized_phone = $1)",
        [TEST_PHONE]
      );
      await client.query("DELETE FROM customers WHERE normalized_phone = $1", [TEST_PHONE]);
    } finally {
      await client.end();
    }
  });

  it("upload file sama 2x -> batch, customer, order, dan angka commit identik", async () => {
    const fileHash = "a".repeat(64);

    const first = await runImport(fileHash);
    expect(first.init.duplicate).toBe(false);
    expect(first.commit.customers).toBe(1);
    expect(first.commit.orders).toBe(1);
    expect(first.commit.items).toBe(1);

    const second = await runImport(fileHash);
    expect(second.init.duplicate).toBe(true);
    expect(second.init.batchId).toBe(first.init.batchId);
    expect(second.commit).toEqual(first.commit);

    // Preview batch COMPLETED wajib melaporkan angka nyata dari DB, bukan nol —
    // sebelumnya customerCount/orderCount di-hardcode 0 untuk upload duplikat.
    expect(second.preview.status).toBe("COMPLETED");
    expect(second.preview.duplicate).toBe(true);
    expect(second.preview.customerCount).toBe(1);
    expect(second.preview.orderCount).toBe(1);
  });
});
