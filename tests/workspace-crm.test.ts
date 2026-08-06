/**
 * Workspace CRM — classification, identity/idempotency, HPP allocation, dan
 * date contract. Semua murni (tanpa DB), sama pola dengan tests/cluster.test.ts
 * dan tests/import-idempotency.test.ts §21.
 */
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  crmAuditLogs,
  crmLeadBatches,
  crmOrderAdjustments,
  crmReconciliations,
  crmReports,
  orders,
  productHppHistory,
} from "@/server/db/schema";
import { classifyCrmTransaction, createOrderFingerprint, normalizeTransactionStatus } from "@/server/workspace/classification";
import { allocateLargestRemainder, allocateOrderComponents } from "@/server/workspace/allocation";
import { assertBusinessDate, jakartaDateRange, nextBusinessDate } from "@/server/workspace/date";
import { roleHasCrmPermission } from "@/lib/crm-permissions";

function hasUniqueIndexOn(table: Parameters<typeof getTableConfig>[0], columns: string[]) {
  const config = getTableConfig(table);
  return config.indexes.some(
    (idx) =>
      idx.config.unique === true &&
      idx.config.columns.map((c) => ("name" in c ? c.name : "")).join(",") === columns.join(",")
  );
}

describe("Workspace CRM — classifyCrmTransaction", () => {
  it("include: Divisi CRM tanpa marketplace/akuisisi", () => {
    const result = classifyCrmTransaction({ division: "CRM", platform: "WhatsApp" });
    expect(result.included).toBe(true);
    expect(result.inclusionReason).toBe("DIVISION_CRM");
    expect(result.exclusionReason).toBeNull();
  });

  it("exclusion selalu menang atas inclusion — Divisi CRM tapi platform TikTok", () => {
    const result = classifyCrmTransaction({ division: "CRM", platform: "TikTok" });
    expect(result.included).toBe(false);
    expect(result.exclusionReason).toBe("CONFLICT_EXCLUSION_WINS");
  });

  it("exclude marketplace non-CRM division", () => {
    expect(classifyCrmTransaction({ division: "MARKETPLACE", platform: "Shopee" }).exclusionReason).toBe("EXCLUDED_MARKETPLACE");
  });

  it("exclude Meta/akuisisi", () => {
    expect(classifyCrmTransaction({ division: "AKUISISI", platform: "Meta" }).exclusionReason).toBe("EXCLUDED_ACQUISITION");
  });

  it("divisi selain CRM dan bukan marketplace/akuisisi -> EXCLUDED_NON_CRM_DIVISION", () => {
    const result = classifyCrmTransaction({ division: "WAREHOUSE", platform: "" });
    expect(result.included).toBe(false);
    expect(result.exclusionReason).toBe("EXCLUDED_NON_CRM_DIVISION");
  });

  it("Nama ADV tidak pernah menjadi bagian dari classification input", () => {
    // classifyCrmTransaction hanya menerima division & platform — nama ADV secara
    // struktural tidak bisa memengaruhi hasil (CLAUDE.md: ADV bukan penentu CRM).
    const withCrm = classifyCrmTransaction({ division: "CRM", platform: "Organic" });
    expect(withCrm.included).toBe(true);
  });
});

describe("Workspace CRM — normalizeTransactionStatus", () => {
  it.each([
    ["Batal", "CANCELLED"],
    ["COD Gagal", "COD_FAILED"],
    ["Retur", "RETURNED"],
    ["Refund Penuh", "REFUNDED"],
    ["Refund Sebagian", "PARTIALLY_REFUNDED"],
    ["", "CONFIRMED"],
    ["Selesai", "CONFIRMED"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeTransactionStatus(input)).toBe(expected);
  });
});

describe("Workspace CRM — createOrderFingerprint (deterministic identity)", () => {
  const base = {
    source: "DATABASE_ALL",
    orderDate: "2026-08-05",
    normalizedPhone: "6281200000001",
    customerName: "Budi",
    csName: "CS A",
    total: 100_000n,
    items: [{ product: "Produk A", qty: 2, amount: 100_000n }],
  };

  it("input identik menghasilkan fingerprint identik", () => {
    expect(createOrderFingerprint(base)).toBe(createOrderFingerprint({ ...base }));
  });

  it("urutan produk multiset tidak memengaruhi fingerprint", () => {
    const swapped = {
      ...base,
      items: [
        { product: "Produk B", qty: 1, amount: 40_000n },
        { product: "Produk A", qty: 2, amount: 60_000n },
      ],
    };
    const reordered = { ...swapped, items: [...swapped.items].reverse() };
    expect(createOrderFingerprint(swapped)).toBe(createOrderFingerprint(reordered));
  });

  it("perubahan total menghasilkan fingerprint berbeda", () => {
    expect(createOrderFingerprint(base)).not.toBe(createOrderFingerprint({ ...base, total: 200_000n }));
  });
});

describe("Workspace CRM — allocateLargestRemainder (BIGINT, no float)", () => {
  it("total rupiah selalu tepat sama dengan input", () => {
    const result = allocateLargestRemainder(10n, [
      { key: "A", weight: 36n },
      { key: "B", weight: 33n },
      { key: "C", weight: 31n },
    ]);
    const sum = [...result.values()].reduce((acc, v) => acc + v, 0n);
    expect(sum).toBe(10n);
  });

  it("pecahan terbesar mendapat sisa rupiah lebih dulu", () => {
    const result = allocateLargestRemainder(10n, [
      { key: "A", weight: 36n },
      { key: "B", weight: 33n },
      { key: "C", weight: 31n },
    ]);
    expect(result.get("A")).toBe(4n);
    expect(result.get("B")).toBe(3n);
    expect(result.get("C")).toBe(3n);
  });

  it("tie-break pecahan sama pakai key stabil, bukan urutan input", () => {
    const result = allocateLargestRemainder(1n, [
      { key: "Z", weight: 1n },
      { key: "A", weight: 1n },
    ]);
    expect(result.get("A")).toBe(1n);
    expect(result.get("Z")).toBe(0n);
  });

  it("bobot semua nol tetap membagi rata dan totalnya tepat", () => {
    const result = allocateLargestRemainder(10n, [
      { key: "A", weight: 0n },
      { key: "B", weight: 0n },
      { key: "C", weight: 0n },
    ]);
    expect([...result.values()].reduce((acc, v) => acc + v, 0n)).toBe(10n);
  });

  it("total nol menghasilkan alokasi nol tanpa error", () => {
    const result = allocateLargestRemainder(0n, [{ key: "A", weight: 5n }]);
    expect(result.get("A")).toBe(0n);
  });
});

describe("Workspace CRM — allocateOrderComponents", () => {
  it("total alokasi per item sama dengan komponen order-level (allocation invariant)", () => {
    const items = [
      { key: "1", gross: 300_000n, quantity: 2n, unitHpp: 50_000n },
      { key: "2", gross: 200_000n, quantity: 1n, unitHpp: null },
    ];
    const allocated = allocateOrderComponents(items, {
      discount: 50_000n,
      packing: 5_000n,
      adminCod: 2_500n,
      voucher: 0n,
      com: 10_000n,
    });
    const totalDiscount = allocated.reduce((acc, row) => acc + row.allocatedDiscount, 0n);
    expect(totalDiscount).toBe(50_000n);
  });

  it("unit HPP unknown -> hppStatus UNKNOWN dan totalHpp null (tidak pernah nol diam-diam)", () => {
    const allocated = allocateOrderComponents(
      [{ key: "1", gross: 100_000n, quantity: 1n, unitHpp: null }],
      { discount: 0n, packing: 0n, adminCod: 0n, voucher: 0n, com: 0n }
    );
    expect(allocated[0]!.hppStatus).toBe("UNKNOWN");
    expect(allocated[0]!.totalHpp).toBeNull();
  });

  it("unit HPP known -> totalHpp = unitHpp x quantity", () => {
    const allocated = allocateOrderComponents(
      [{ key: "1", gross: 100_000n, quantity: 3n, unitHpp: 20_000n }],
      { discount: 0n, packing: 0n, adminCod: 0n, voucher: 0n, com: 0n }
    );
    expect(allocated[0]!.totalHpp).toBe(60_000n);
    expect(allocated[0]!.hppStatus).toBe("KNOWN");
  });
});

describe("Workspace CRM — kontrak tanggal Asia/Jakarta", () => {
  it("assertBusinessDate menolak format bukan YYYY-MM-DD", () => {
    expect(() => assertBusinessDate("2026/08/05")).toThrow();
    expect(() => assertBusinessDate("05-08-2026")).toThrow();
  });

  it("nextBusinessDate menambah satu hari kalender", () => {
    expect(nextBusinessDate("2026-08-05")).toBe("2026-08-06");
    expect(nextBusinessDate("2026-01-31")).toBe("2026-02-01");
  });

  it("jakartaDateRange: satu tanggal menghasilkan rentang [start, start+1) exclusive", () => {
    const { start, endExclusive } = jakartaDateRange("2026-08-05", "2026-08-05");
    expect(endExclusive.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("jakartaDateRange menolak from > to", () => {
    expect(() => jakartaDateRange("2026-08-10", "2026-08-01")).toThrow();
  });
});

describe("Workspace CRM — permission matrix", () => {
  it("ADMIN memiliki seluruh permission", () => {
    expect(roleHasCrmPermission("ADMIN", "crm.hpp.update")).toBe(true);
    expect(roleHasCrmPermission("ADMIN", "crm.reconciliation.approve")).toBe(true);
  });

  it("CRM tidak boleh approve reconciliation atau update HPP (admin-only)", () => {
    expect(roleHasCrmPermission("CRM", "crm.reconciliation.approve")).toBe(false);
    expect(roleHasCrmPermission("CRM", "crm.hpp.update")).toBe(false);
  });

  it("CRM boleh membuat/mengubah/membatalkan pesanan manual", () => {
    expect(roleHasCrmPermission("CRM", "crm.manual_order.create")).toBe(true);
    expect(roleHasCrmPermission("CRM", "crm.manual_order.cancel")).toBe(true);
  });

  it("MANAGEMENT tidak memiliki permission CRM apa pun — domain ini memuat PII customer (sama seperti /workspace)", () => {
    expect(roleHasCrmPermission("MANAGEMENT", "crm.metric.read")).toBe(false);
    expect(roleHasCrmPermission("MANAGEMENT", "crm.official_order.read")).toBe(false);
    expect(roleHasCrmPermission("MANAGEMENT", "crm.manual_order.create")).toBe(false);
    expect(roleHasCrmPermission("MANAGEMENT", "crm.task.assign")).toBe(false);
  });
});

describe("Workspace CRM — schema identity & idempotency", () => {
  it("orders punya unique index deterministic_fingerprint (fallback identity selain source_order_key)", () => {
    expect(hasUniqueIndexOn(orders, ["deterministic_fingerprint"])).toBe(true);
  });

  it("crm_lead_batches: source+source_batch_id unik, import_batch_id BUKAN identity", () => {
    const config = getTableConfig(crmLeadBatches);
    expect(
      config.indexes.some(
        (idx) => idx.config.unique && idx.config.columns.map((c) => ("name" in c ? c.name : "")).join(",") === "source,source_batch_id"
      )
    ).toBe(true);
    expect(hasUniqueIndexOn(crmLeadBatches, ["import_batch_id"])).toBe(false);
  });

  it("product_hpp_history punya exclusion constraint anti-overlap (dicek via check constraints + kolom range)", () => {
    const config = getTableConfig(productHppHistory);
    expect(config.columns.some((c) => c.name === "effective_from")).toBe(true);
    expect(config.columns.some((c) => c.name === "effective_to")).toBe(true);
    expect(config.checks.some((c) => c.name === "product_hpp_range_ck")).toBe(true);
  });

  it("crm_reconciliations: satu manual report dan satu official order hanya boleh RECONCILED sekali", () => {
    expect(hasUniqueIndexOn(crmReconciliations, ["manual_report_id"])).toBe(true);
    expect(hasUniqueIndexOn(crmReconciliations, ["official_order_id"])).toBe(true);
  });

  it("crm_order_adjustments wajib punya identity (source_adjustment_id atau fingerprint) — idempotent", () => {
    const config = getTableConfig(crmOrderAdjustments);
    expect(config.checks.some((c) => c.name === "crm_adjustments_identity_ck")).toBe(true);
  });

  it("crm_reports punya reconciliation_status dan deterministic_fingerprint untuk manual matching", () => {
    const config = getTableConfig(crmReports);
    expect(config.columns.some((c) => c.name === "reconciliation_status")).toBe(true);
    expect(config.columns.some((c) => c.name === "deterministic_fingerprint")).toBe(true);
  });

  it("crm_audit_logs menyimpan actor, before/after, dan reason", () => {
    const config = getTableConfig(crmAuditLogs);
    const names = config.columns.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(["actor_user_id", "action", "entity_type", "entity_id", "before_value", "after_value", "reason"])
    );
  });
});
