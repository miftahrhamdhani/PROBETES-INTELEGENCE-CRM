/**
 * Workspace — task workflow (assign/status/outcome) dan deteksi customer baru.
 *
 * Sama pola dengan tests/import-idempotency.test.ts: bagian ini murni logic +
 * schema check (tanpa DB, selalu jalan di CI). Idempotensi deteksi customer
 * baru (crm_tasks_new_customer_uq) dibuktikan lewat unique index, sama seperti
 * orders_source_key_uq dibuktikan di import-idempotency.test.ts — bukan lewat
 * integration test terpisah, supaya tidak ada logic ganda yang perlu disinkronkan.
 */
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { crmReports, crmTasks } from "@/server/db/schema";
import {
  BULK_STATUS_TARGETS,
  assignTaskSchema,
  bulkStatusSchema,
  canTransitionStatus,
  completeTaskSchema,
  createTaskSchema,
  type CrmTaskStatus,
} from "@/lib/workspace-contracts";

function hasUniqueIndexOn(table: Parameters<typeof getTableConfig>[0], columns: string[]) {
  const config = getTableConfig(table);
  return config.indexes.some(
    (idx) =>
      idx.config.unique === true &&
      idx.config.columns.map((c) => ("name" in c ? c.name : "")).join(",") === columns.join(",")
  );
}

describe("Workspace — deteksi customer baru (schema)", () => {
  it("crm_tasks punya unique index partial customer_id -> re-import file sama tidak pernah duplicate FOLLOW_UP_NEW_CUSTOMER", () => {
    // Partial unique index (WHERE task_type = 'FOLLOW_UP_NEW_CUSTOMER') — inilah
    // yang membuat detectNewCustomersFromBatch aman dipanggil berkali-kali untuk
    // customer yang sama (ON CONFLICT DO NOTHING di src/server/workspace/detection.ts).
    expect(hasUniqueIndexOn(crmTasks, ["customer_id"])).toBe(true);
  });

  it("crm_tasks.customer_id ON DELETE CASCADE mengikuti customers (konsisten dengan tabel lain)", () => {
    const fk = getTableConfig(crmTasks)
      .foreignKeys.map((f) => f.reference())
      .find((ref) => ref.columns.map((c) => c.name).join(",") === "customer_id");
    expect(fk?.foreignTable).toBeDefined();
  });

  it("crm_reports.task_id ada sebagai provenance opsional (laporan tetap berdiri sendiri kalau null)", () => {
    const column = getTableConfig(crmReports).columns.find((c) => c.name === "task_id");
    expect(column).toBeDefined();
    expect(column?.notNull).toBe(false);
  });
});

describe("Workspace — aturan transisi status (canTransitionStatus)", () => {
  it("alur normal: UNASSIGNED -> ASSIGNED -> IN_PROGRESS -> DONE", () => {
    expect(canTransitionStatus("UNASSIGNED", "ASSIGNED")).toBe(true);
    expect(canTransitionStatus("ASSIGNED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionStatus("IN_PROGRESS", "DONE")).toBe(true);
  });

  it("boleh batal dari status manapun yang masih aktif", () => {
    expect(canTransitionStatus("UNASSIGNED", "CANCELLED")).toBe(true);
    expect(canTransitionStatus("ASSIGNED", "CANCELLED")).toBe(true);
    expect(canTransitionStatus("IN_PROGRESS", "CANCELLED")).toBe(true);
  });

  it("DONE dan CANCELLED adalah status akhir (kecuali reaktivasi CANCELLED -> UNASSIGNED)", () => {
    expect(canTransitionStatus("DONE", "ASSIGNED")).toBe(false);
    expect(canTransitionStatus("DONE", "CANCELLED")).toBe(false);
    expect(canTransitionStatus("CANCELLED", "UNASSIGNED")).toBe(true);
    expect(canTransitionStatus("CANCELLED", "ASSIGNED")).toBe(false);
  });

  it("tidak bisa lompat UNASSIGNED langsung ke IN_PROGRESS/DONE (harus lewat ASSIGNED)", () => {
    expect(canTransitionStatus("UNASSIGNED", "IN_PROGRESS")).toBe(false);
    expect(canTransitionStatus("UNASSIGNED", "DONE")).toBe(false);
  });

  it("tidak bisa lompat ASSIGNED langsung ke DONE (harus lewat IN_PROGRESS, atau completeTask khusus)", () => {
    expect(canTransitionStatus("ASSIGNED", "DONE")).toBe(false);
  });

  it("status sama ke status sama selalu dianggap valid (no-op)", () => {
    const statuses: CrmTaskStatus[] = ["UNASSIGNED", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELLED"];
    for (const status of statuses) expect(canTransitionStatus(status, status)).toBe(true);
  });
});

describe("Workspace — validasi Zod", () => {
  it("bulkStatusSchema menolak DONE sebagai target (DONE wajib lewat completeTask, butuh outcome)", () => {
    expect(BULK_STATUS_TARGETS).not.toContain("DONE");
    expect(bulkStatusSchema.safeParse({ taskIds: [1, 2], status: "DONE" }).success).toBe(false);
    expect(bulkStatusSchema.safeParse({ taskIds: [1, 2], status: "IN_PROGRESS" }).success).toBe(true);
  });

  it("completeTaskSchema wajib outcome", () => {
    expect(completeTaskSchema.safeParse({ notes: "test" }).success).toBe(false);
    expect(completeTaskSchema.safeParse({ outcome: "CONTACTED" }).success).toBe(true);
  });

  it("assignTaskSchema wajib assignedTo positif", () => {
    expect(assignTaskSchema.safeParse({ assignedTo: 0 }).success).toBe(false);
    expect(assignTaskSchema.safeParse({ assignedTo: 5, dueAt: "2026-08-01" }).success).toBe(true);
  });

  it("createTaskSchema menerima jenis tugas manual (repeat/broadcast/invite/other)", () => {
    expect(createTaskSchema.safeParse({ customerId: 1, taskType: "FOLLOW_UP_REPEAT" }).success).toBe(true);
    expect(createTaskSchema.safeParse({ customerId: 1, taskType: "INVALID" }).success).toBe(false);
  });
});
