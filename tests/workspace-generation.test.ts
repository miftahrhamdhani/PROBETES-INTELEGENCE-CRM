import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regresi BUG workspace_generation.
 *
 * `workspace_orders.workspace_generation` menandai angkatan data Workspace,
 * tapi sebelumnya TIDAK PERNAH dibaca satu query pun — aturan "hanya generation
 * aktif" hanya benar secara kebetulan karena seluruh baris memakai nilai default
 * yang sama. Begitu angkatan kedua dibuat, seluruh KPI/daftar/export diam-diam
 * menjumlahkan dua angkatan sekaligus.
 *
 * Test ini menjalankan setiap fungsi baca Workspace terhadap `getDb()` palsu,
 * lalu memeriksa SQL yang benar-benar dikirim memuat filter generation.
 */
const executed: string[] = [];

/** Rangkai ulang SQL drizzle (chunk + param) jadi teks yang bisa diperiksa. */
function renderSql(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(renderSql).join(" ");
  const record = node as Record<string, unknown>;
  if (typeof record.value === "string") return record.value;
  if (Array.isArray(record.value)) return record.value.map(renderSql).join(" ");
  if (Array.isArray(record.queryChunks)) return record.queryChunks.map(renderSql).join(" ");
  return "";
}

vi.mock("@/server/db/client", () => ({
  getDb: () => ({
    execute: async (query: unknown) => {
      executed.push(renderSql(query));
      return { rows: [] };
    },
  }),
}));

const overview = await import("@/server/workspace/pesanan-overview");
const pesanan = await import("@/server/workspace/pesanan");
const { ACTIVE_WORKSPACE_GENERATION, activeGenerationCondition } = await import("@/server/workspace/generation");

const RANGE = { from: "2026-01-01", to: "2026-12-31" };

beforeEach(() => {
  executed.length = 0;
});

/** Setiap SQL yang menyentuh workspace_orders WAJIB memfilter generation. */
function expectGenerationFilteredEverywhere() {
  const touching = executed.filter((text) => text.includes("workspace_orders"));
  expect(touching.length, "tidak ada query workspace_orders yang tertangkap").toBeGreaterThan(0);
  for (const text of touching) {
    expect(text, `query tanpa filter generation:\n${text}`).toContain("workspace_generation");
  }
}

describe("filter generation aktif pada seluruh jalur baca Workspace", () => {
  it("helper memakai satu sumber canonical, bukan string literal tersebar", () => {
    expect(ACTIVE_WORKSPACE_GENERATION).toBe("CRM_FRESH_V1");
    expect(renderSql(activeGenerationCondition("o"))).toContain("o.workspace_generation");
    expect(renderSql(activeGenerationCondition(""))).toContain("workspace_generation");
  });

  it("Overview KPI memfilter generation", async () => {
    await overview.getOverviewKpi(RANGE);
    expectGenerationFilteredEverywhere();
  });

  it("Overview trend memfilter generation", async () => {
    await overview.getPesananTrend(RANGE);
    expectGenerationFilteredEverywhere();
  });

  it("produk terlaris (quantity/revenue/COS) memfilter generation", async () => {
    await overview.getTopProductsByQuantity(RANGE);
    await overview.getTopProductsByRevenue(RANGE);
    await overview.getTopProductsByCos(RANGE);
    expectGenerationFilteredEverywhere();
  });

  it("komposisi pembayaran memfilter generation", async () => {
    await overview.getPaymentComposition(RANGE);
    expectGenerationFilteredEverywhere();
  });

  it("ringkasan customer (jumlah customer & pesanan) memfilter generation", async () => {
    await overview.getCustomerSummary(RANGE);
    expectGenerationFilteredEverywhere();
  });

  it("daftar Pesanan DAN count-nya memfilter generation", async () => {
    await pesanan.listWorkspaceOrders({ page: 1, perPage: 50 } as never);
    // Dua query: baris + count. Keduanya harus terfilter, bukan hanya barisnya —
    // count yang tidak terfilter membuat pagination menghitung angkatan lama.
    expect(executed.filter((t) => t.includes("workspace_orders")).length).toBe(2);
    expectGenerationFilteredEverywhere();
  });

  it("KPI Pesanan memfilter generation", async () => {
    await pesanan.getWorkspacePesananKpi({ page: 1, perPage: 50 } as never);
    expectGenerationFilteredEverywhere();
  });

  it("detail Pesanan memfilter generation (order angkatan lama tidak bisa dibuka)", async () => {
    await pesanan.getWorkspaceOrder(1);
    expectGenerationFilteredEverywhere();
  });

  it("export memakai jalur listWorkspaceOrders yang sama, jadi ikut terfilter", async () => {
    await pesanan.listWorkspaceOrders({ page: 1, perPage: 5000 } as never);
    expectGenerationFilteredEverywhere();
  });
});

/**
 * Regresi BUG "pesanan tanpa No Order muncul di Semua Pesanan": bucket tab
 * Pesanan sebelumnya murni fungsi `status`, jadi baris CONFIRMED yang belum
 * (atau tidak lagi) punya source_order_id (No Order/ID Pesanan Everpro) tetap
 * lolos ke tab "Semua Pesanan". Sekarang bucket-nya WAJIB mempertimbangkan
 * source_order_id juga — lihat buildOrderConditions di server/workspace/pesanan.ts.
 */
describe("bucket tab Pesanan mempertimbangkan source_order_id (No Order/ID Pesanan Everpro)", () => {
  function rowsQuery(): string {
    const text = executed.find((t) => t.includes("workspace_orders") && t.includes("GROUP BY"));
    expect(text, "query baris (SELECT ... GROUP BY o.id) tidak tertangkap").toBeDefined();
    return text!;
  }

  it("tab draft: status DRAFT ATAU source_order_id kosong (apapun status-nya)", async () => {
    await pesanan.listWorkspaceOrders({ page: 1, perPage: 50, tab: "draft" } as never);
    const text = rowsQuery();
    expect(text).toContain("o.status = 'DRAFT'");
    expect(text).toContain("o.source_order_id IS NULL");
  });

  it("tab semua: status CONFIRMED DAN source_order_id sudah ada", async () => {
    await pesanan.listWorkspaceOrders({ page: 1, perPage: 50, tab: "semua" } as never);
    const text = rowsQuery();
    expect(text).toContain("o.status = 'CONFIRMED'");
    expect(text).toContain("o.source_order_id IS NOT NULL");
  });

  it("tab retur_refund: status retur/refund DAN source_order_id sudah ada", async () => {
    await pesanan.listWorkspaceOrders({ page: 1, perPage: 50, tab: "retur_refund" } as never);
    const text = rowsQuery();
    expect(text).toContain("o.source_order_id IS NOT NULL");
  });

  it("KPI Pesanan (tab semua) juga mewajibkan source_order_id", async () => {
    await pesanan.getWorkspacePesananKpi({ page: 1, perPage: 50, tab: "semua" } as never);
    const text = executed.find((t) => t.includes("workspace_orders"));
    expect(text).toContain("o.source_order_id IS NOT NULL");
  });

  it("Overview KPI (Total Sales/AOV) juga mewajibkan source_order_id — konsisten dengan tab Semua Pesanan", async () => {
    await overview.getOverviewKpi(RANGE);
    const text = executed.find((t) => t.includes("workspace_orders"));
    expect(text).toContain("source_order_id IS NOT NULL");
  });
});
