/**
 * 21 skenario wajib dari docs/02-CLUSTER-RULES.md §9 (nomor 21 upload-idempoten
 * dan 22 order-per-hari diuji di tests/import.test.ts, bukan di sini).
 */
import { describe, expect, it } from "vitest";
import { RULE_VERSION } from "@/lib/cluster-codes";
import { classifyProduct } from "@/server/normalize/product-catalog";
import { buildCustomerFeatures } from "@/server/cluster/features";
import { assignCluster } from "@/server/cluster/engine";
import type { ClusterContext, GroupStatus, RawOrderInput, RawOrderItemInput } from "@/server/cluster/types";

function item(productName: string, amount: number, isBonus = false): RawOrderItemInput {
  return { amount: BigInt(amount), isBonus, productFlags: classifyProduct(productName) };
}

function order(date: string, items: RawOrderItemInput[]): RawOrderInput {
  return { date, items };
}

function ctx(asOfDate: string): ClusterContext {
  return { asOfDate, ruleVersion: RULE_VERSION };
}

function features(
  orders: RawOrderInput[],
  hasGroup: GroupStatus,
  yaconaFrequency: number,
  c: ClusterContext
) {
  return buildCustomerFeatures(orders, hasGroup, yaconaFrequency, c);
}

describe("Cluster engine — 02-CLUSTER-RULES.md §9", () => {
  it("1. KSB F6 (tidak pernah muncul di Database All) -> B", () => {
    const f = features([], "NOT_GROUPED", 6, ctx("2026-07-26"));
    expect(assignCluster(f, ctx("2026-07-26")).clusterCode).toBe("B");
  });

  it("2. KSB F5 saja (tidak pernah muncul di Database All) -> YACONA_NON_COHORT", () => {
    const f = features([], "NOT_GROUPED", 5, ctx("2026-07-26"));
    expect(assignCluster(f, ctx("2026-07-26")).clusterCode).toBe("YACONA_NON_COHORT");
  });

  it("3. F2, M = 1.500.000 -> A1", () => {
    const c = ctx("2026-01-01");
    const f = features(
      [
        order("2025-01-10", [item("HERBAL PROBETES 24", 750_000)]),
        order("2025-02-10", [item("HERBAL PROBETES 24", 750_000)]),
      ],
      "NOT_GROUPED",
      0,
      c
    );
    expect(assignCluster(f, c).clusterCode).toBe("A1");
  });

  it("4. F2, M = 1.499.999 -> bukan A1 (jadi A2)", () => {
    const c = ctx("2026-01-01");
    const f = features(
      [
        order("2024-05-01", [item("HERBAL PROBETES 24", 749_999)]),
        order("2024-06-01", [item("HERBAL PROBETES 24", 750_000)]),
      ],
      "NOT_GROUPED",
      0,
      c
    );
    const result = assignCluster(f, c);
    expect(result.clusterCode).not.toBe("A1");
    expect(result.clusterCode).toBe("A2");
  });

  it("5. F1 Ebook, Nov 2025, has_group -> C-Prodig", () => {
    const c = ctx("2025-11-20");
    const f = features([order("2025-11-05", [item("EBOOK 90", 89_000)])], "GROUPED", 0, c);
    expect(assignCluster(f, c).clusterCode).toBe("C_PRODIG");
  });

  it("6. F1 HP, Nov 2025, has_group -> C-HP", () => {
    const c = ctx("2025-11-20");
    const f = features([order("2025-11-05", [item("PROBETES HERBAL 24", 445_000)])], "GROUPED", 0, c);
    expect(assignCluster(f, c).clusterCode).toBe("C_HP");
  });

  it("7. F2 Ebook+Ebook, has_group -> C-F2", () => {
    const c = ctx("2026-01-01");
    const f = features(
      [
        order("2025-06-01", [item("EBOOK 90", 89_000)]),
        order("2025-07-01", [item("EBOOK 30", 89_000)]),
      ],
      "GROUPED",
      0,
      c
    );
    expect(assignCluster(f, c).clusterCode).toBe("C_F2");
  });

  it("8. F1 Ebook, no group, umur 15 hari -> D-New", () => {
    const c = ctx("2025-11-20");
    const f = features([order("2025-11-05", [item("EBOOK 90", 89_000)])], "NOT_GROUPED", 0, c);
    expect(assignCluster(f, c).clusterCode).toBe("D_NEW");
  });

  it("9. F1 Ebook, no group, umur 16 hari -> D-Old", () => {
    const c = ctx("2025-11-20");
    const f = features([order("2025-11-04", [item("EBOOK 90", 89_000)])], "NOT_GROUPED", 0, c);
    expect(assignCluster(f, c).clusterCode).toBe("D_OLD");
  });

  it("10. F1 HP, no group, bulan berjalan -> Dhp-New", () => {
    const c = ctx("2026-04-15");
    const f = features([order("2026-04-03", [item("PROBETES HERBAL 24", 445_000)])], "NOT_GROUPED", 0, c);
    expect(assignCluster(f, c).clusterCode).toBe("DHP_NEW");
  });

  it("11. F1 HP, no group, bulan sebelumnya -> Dhp-Old", () => {
    const c = ctx("2026-04-15");
    const f = features([order("2026-03-20", [item("PROBETES HERBAL 24", 445_000)])], "NOT_GROUPED", 0, c);
    expect(assignCluster(f, c).clusterCode).toBe("DHP_OLD");
  });

  it("12. First Ebook Mar-Okt 2025, F1, belum pernah produk fisik -> E", () => {
    const c = ctx("2026-07-26");
    const f = features([order("2025-05-10", [item("EBOOK 90", 89_000)])], "NOT_GROUPED", 0, c);
    expect(assignCluster(f, c).clusterCode).toBe("E");
  });

  it("13. F2 biasa (bukan kandidat C-F2/D) -> A2", () => {
    const c = ctx("2026-01-01");
    const f = features(
      [
        order("2024-05-01", [item("HERBAL PROBETES 24", 100_000)]),
        order("2024-06-01", [item("HERBAL PROBETES 24", 100_000)]),
      ],
      "NOT_GROUPED",
      0,
      c
    );
    expect(assignCluster(f, c).clusterCode).toBe("A2");
  });

  it("14. F3 biasa -> A3", () => {
    const c = ctx("2026-01-01");
    const f = features(
      [
        order("2024-05-01", [item("EBOOK 90", 89_000)]),
        order("2024-06-01", [item("EBOOK 90", 89_000)]),
        order("2024-07-01", [item("EBOOK 90", 89_000)]),
      ],
      "NOT_GROUPED",
      0,
      c
    );
    expect(assignCluster(f, c).clusterCode).toBe("A3");
  });

  it("15. F4 biasa -> A4", () => {
    const c = ctx("2026-01-01");
    const f = features(
      [
        order("2024-05-01", [item("EBOOK 90", 89_000)]),
        order("2024-06-01", [item("EBOOK 90", 89_000)]),
        order("2024-07-01", [item("EBOOK 90", 89_000)]),
        order("2024-08-01", [item("EBOOK 90", 89_000)]),
      ],
      "NOT_GROUPED",
      0,
      c
    );
    expect(assignCluster(f, c).clusterCode).toBe("A4");
  });

  it("16. Tidak match apa pun -> F", () => {
    const c = ctx("2026-07-26");
    const f = features([order("2024-06-01", [item("BERAS ORGANIK", 90_000)])], "NOT_GROUPED", 0, c);
    expect(assignCluster(f, c).clusterCode).toBe("F");
  });

  it("17. Order Ebook + Herbal Probetes -> bukan EBOOK_ONLY", () => {
    const c = ctx("2026-07-26");
    const f = features(
      [order("2025-11-05", [item("EBOOK 90", 89_000), item("PROBETES HERBAL 24", 445_000)])],
      "GROUPED",
      0,
      c
    );
    expect(f.firstOrder?.isEbookOnly).toBe(false);
    expect(f.firstOrder?.containsHpOrAmandia).toBe(true);
  });

  it("18. Order Ebook + Stevia Bonus (Rp0) -> tetap EBOOK_ONLY", () => {
    const c = ctx("2026-07-26");
    const f = features(
      [order("2025-11-05", [item("EBOOK 90", 89_000, false), item("STEVIA BONUS", 0, true)])],
      "GROUPED",
      0,
      c
    );
    expect(f.firstOrder?.isEbookOnly).toBe(true);
  });

  it("19. First Ebook Mar-Okt 2025, F3, semua ebook, belum pernah fisik -> A3 (bukan E)", () => {
    const c = ctx("2026-07-26");
    const f = features(
      [
        order("2025-04-01", [item("EBOOK 90", 89_000)]),
        order("2025-05-01", [item("EBOOK 30", 89_000)]),
        order("2025-06-01", [item("EBOOK 145", 89_000)]),
      ],
      "NOT_GROUPED",
      0,
      c
    );
    const result = assignCluster(f, c);
    expect(result.clusterCode).toBe("A3");
    expect(result.clusterCode).not.toBe("E");
  });

  it("20. First Ebook Mar-Okt 2025, M >= 1,5jt -> A1 (bukan E)", () => {
    const c = ctx("2026-07-26");
    const f = features(
      [
        order("2025-04-01", [item("EBOOK 90", 800_000)]),
        order("2025-05-01", [item("EBOOK 30", 800_000)]),
      ],
      "NOT_GROUPED",
      0,
      c
    );
    const result = assignCluster(f, c);
    expect(result.clusterCode).toBe("A1");
    expect(result.clusterCode).not.toBe("E");
  });

  // 21. Upload file sama 2x -> state database identik: lihat
  // tests/import-idempotency.test.ts — determinisme parser + unique index
  // exact-replacement jalan tanpa DB; commit sungguhan ke Neon di describe
  // integration (opt-in RUN_DB_INTEGRATION_TESTS=1).

  it("23. F2 Ebook+Ebook, Nov 2025, belum masuk grup -> D-New/D-Old (bukan A2)", () => {
    const c = ctx("2026-01-01");
    const f = features(
      [
        order("2025-11-05", [item("EBOOK 90", 89_000)]),
        order("2025-11-10", [item("EBOOK 30", 89_000)]),
      ],
      "NOT_GROUPED",
      0,
      c
    );
    const result = assignCluster(f, c);
    expect(["D_NEW", "D_OLD"]).toContain(result.clusterCode);
    expect(result.clusterCode).not.toBe("A2");
  });
});

describe("Cluster engine — status non-cluster", () => {
  it("NEEDS_REVIEW: keputusan cluster bergantung produk UNKNOWN", () => {
    const c = ctx("2025-11-20");
    const f = features(
      [order("2025-11-05", [item("PAKET APRESIASI REMISI", 89_000)])],
      "GROUPED",
      0,
      c
    );
    expect(f.needsReview).toBe(true);
    expect(assignCluster(f, c).clusterCode).toBe("NEEDS_REVIEW");
  });

  it("NEEDS_REVIEW tidak dipicu kalau produk UNKNOWN tidak relevan (F>=3, sudah pasti A3/A4)", () => {
    const c = ctx("2026-01-01");
    const f = features(
      [
        order("2024-05-01", [item("PAKET APRESIASI REMISI", 89_000)]),
        order("2024-06-01", [item("EBOOK 90", 89_000)]),
        order("2024-07-01", [item("EBOOK 90", 89_000)]),
      ],
      "NOT_GROUPED",
      0,
      c
    );
    expect(f.needsReview).toBe(false);
    expect(assignCluster(f, c).clusterCode).toBe("A3");
  });

  it("NEEDS_REVIEW: F1 Ebook Nov 2025, status grup UNKNOWN -> bukan otomatis D-New", () => {
    const c = ctx("2025-11-20");
    const f = features([order("2025-11-05", [item("EBOOK 90", 89_000)])], "UNKNOWN", 0, c);
    expect(f.needsReview).toBe(true);
    const result = assignCluster(f, c);
    expect(result.clusterCode).toBe("NEEDS_REVIEW");
    expect(result.clusterCode).not.toBe("D_NEW");
  });

  it("NEEDS_REVIEW: F1 HP/Amandia Nov 2025, status grup UNKNOWN -> bukan otomatis Dhp", () => {
    const c = ctx("2025-11-20");
    const f = features(
      [order("2025-11-05", [item("PROBETES HERBAL 24", 445_000)])],
      "UNKNOWN",
      0,
      c
    );
    expect(f.needsReview).toBe(true);
    const result = assignCluster(f, c);
    expect(result.clusterCode).toBe("NEEDS_REVIEW");
    expect(result.clusterCode).not.toBe("DHP_NEW");
  });

  it("NEEDS_REVIEW: F2 Ebook+Ebook, status grup UNKNOWN -> bukan otomatis A2", () => {
    const c = ctx("2026-01-01");
    const f = features(
      [
        order("2025-06-01", [item("EBOOK 90", 89_000)]),
        order("2025-07-01", [item("EBOOK 30", 89_000)]),
      ],
      "UNKNOWN",
      0,
      c
    );
    expect(f.needsReview).toBe(true);
    expect(assignCluster(f, c).clusterCode).toBe("NEEDS_REVIEW");
  });

  it("UNKNOWN tidak memicu NEEDS_REVIEW kalau cluster tidak bergantung status grup (F2 non-ebook -> A2)", () => {
    const c = ctx("2026-01-01");
    const f = features(
      [
        order("2024-05-01", [item("HERBAL PROBETES 24", 100_000)]),
        order("2024-06-01", [item("HERBAL PROBETES 24", 100_000)]),
      ],
      "UNKNOWN",
      0,
      c
    );
    expect(f.needsReview).toBe(false);
    expect(assignCluster(f, c).clusterCode).toBe("A2");
  });
});
