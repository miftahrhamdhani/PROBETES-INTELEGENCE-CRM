/**
 * Regresi: retry Import Database All setelah batch FAILED.
 *
 * Sebelum perbaikan, upload ulang file yang sama buntu:
 *   initDatabaseAllImport() mengembalikan batch FAILED lama (lookup tidak
 *   memfilter status) -> stageDatabaseAllRows() menolaknya ("tidak menerima
 *   chunk"). Satu-satunya jalan keluar adalah mengubah isi file.
 *
 * Test ini menjaga tiga hal sekaligus: batch FAILED tidak dipakai ulang,
 * COMPLETED tetap jadi duplicate protection, dan guard staging tidak dilonggarkan.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { importBatches } from "@/server/db/schema";

/** Menangkap kondisi WHERE yang dikirim ke SELECT import_batches. */
const capturedWhere: unknown[] = [];
const selectResult: Record<string, unknown>[] = [];
const insertedValues: Record<string, unknown>[] = [];

vi.mock("@/server/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: (cond: unknown) => {
          capturedWhere.push(cond);
          const chain = {
            orderBy: () => chain,
            limit: async () => selectResult,
            then: (r: (v: unknown) => unknown) => Promise.resolve(selectResult).then(r),
          };
          return chain;
        },
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        insertedValues.push(v);
        return { returning: async () => [{ id: 999 }] };
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  }),
}));

const { initDatabaseAllImport } = await import("@/server/import/orchestrator");

beforeEach(() => {
  capturedWhere.length = 0;
  selectResult.length = 0;
  insertedValues.length = 0;
});

const SRC = readFileSync(resolve(process.cwd(), "src/server/import/orchestrator.ts"), "utf8");

describe("initDatabaseAllImport — batch FAILED tidak dipakai ulang", () => {
  it("TEST-1: tidak ada batch non-FAILED -> membuat batch BARU (retry setelah gagal)", async () => {
    // selectResult kosong = lookup mengabaikan batch FAILED yang ada.
    const hasil = await initDatabaseAllImport({ filename: "01. database All.xlsx", fileHash: "ABC", totalRows: 36902 });
    expect(hasil.duplicate).toBe(false);
    expect(hasil.completed).toBe(false);
    expect(hasil.batchId).toBe(999);
    // Batch baru memakai file_hash YANG SAMA (lowercase).
    expect(insertedValues[0]).toMatchObject({ fileHash: "abc", status: "UPLOADING" });
  });

  it("TEST-2/5: batch COMPLETED -> duplicate protection tetap aktif, tidak insert baru", async () => {
    selectResult.push({ id: 14, status: "COMPLETED" });
    const hasil = await initDatabaseAllImport({ filename: "sama.xlsx", fileHash: "DONE", totalRows: 10 });
    expect(hasil).toEqual({ batchId: 14, duplicate: true, completed: true });
    expect(insertedValues).toHaveLength(0);
  });

  it("TEST-3: batch resumable (STAGED) tetap di-resume, bukan bikin baru", async () => {
    selectResult.push({ id: 20, status: "STAGED" });
    const hasil = await initDatabaseAllImport({ filename: "lanjut.xlsx", fileHash: "MID", totalRows: 10 });
    expect(hasil).toEqual({ batchId: 20, duplicate: true, completed: false });
    expect(insertedValues).toHaveLength(0);
  });

  it("lookup memfilter status FAILED dan mengambil attempt TERAKHIR", () => {
    const fn = SRC.slice(SRC.indexOf("export async function initDatabaseAllImport"));
    const body = fn.slice(0, fn.indexOf("export async function", 10));
    expect(body).toContain('ne(importBatches.status, "FAILED")');
    expect(body).toContain("desc(importBatches.id)");
  });

  it("TIDAK ada UPDATE yang mereset status batch FAILED", () => {
    const fn = SRC.slice(SRC.indexOf("export async function initDatabaseAllImport"));
    const body = fn.slice(0, fn.indexOf("export async function", 10));
    expect(body).not.toMatch(/update\(importBatches\)/);
  });
});

describe("Guard staging TIDAK dilonggarkan", () => {
  const fn = SRC.slice(SRC.indexOf("export async function stageDatabaseAllRows"));
  const body = fn.slice(0, fn.indexOf("export async function", 10));

  it("hanya UPLOADING/STAGED yang menerima chunk", () => {
    expect(body).toContain('batch.status !== "UPLOADING" && batch.status !== "STAGED"');
  });

  it("FAILED tetap ditolak (guard tidak dihapus)", () => {
    expect(body).toMatch(/throw new Error\(/);
  });

  it("pesan error menampilkan penyebab ASLI, bukan hanya gejala sekunder", () => {
    expect(body).toContain("Import sebelumnya gagal:");
    expect(body).toContain("batch.errorMessage");
  });
});

describe("Partial unique index — schema", () => {
  it("unique (source_type, file_hash) bersifat PARTIAL, mengecualikan FAILED", () => {
    const config = getTableConfig(importBatches);
    const idx = config.indexes.find((i) => i.config.name === "import_batches_source_hash_uq");
    expect(idx).toBeDefined();
    expect(idx!.config.unique).toBe(true);
    expect(idx!.config.where).toBeDefined();
    expect(idx!.config.columns.map((c) => ("name" in c ? c.name : ""))).toEqual(["source_type", "file_hash"]);
  });

  it("migration 0023 non-destruktif: tidak menghapus/mengubah baris", () => {
    const mig = readFileSync(
      resolve(process.cwd(), "src/server/db/migrations/0023_import_retry_after_failed.sql"),
      "utf8"
    );
    const perintah = mig.replace(/--.*$/gm, "");
    expect(perintah).toMatch(/DROP INDEX IF EXISTS/);
    expect(perintah).toMatch(/CREATE UNIQUE INDEX/);
    expect(perintah).toMatch(/WHERE "status" <> 'FAILED'/);
    // Tidak boleh ada DML/DDL destruktif.
    expect(perintah).not.toMatch(/\bDELETE\b|\bUPDATE\b|\bDROP TABLE\b|\bDROP COLUMN\b|\bTRUNCATE\b/i);
  });

  it("migration mencantumkan rollback plan", () => {
    const mig = readFileSync(
      resolve(process.cwd(), "src/server/db/migrations/0023_import_retry_after_failed.sql"),
      "utf8"
    );
    expect(mig).toContain("ROLLBACK");
  });
});
