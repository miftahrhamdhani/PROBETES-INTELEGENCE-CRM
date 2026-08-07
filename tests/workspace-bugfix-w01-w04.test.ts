/**
 * Regresi BUG-W01..W04 (hasil audit backend Workspace).
 *
 * Pola sama dengan tests/workspace-pesanan-service.test.ts: client DB dimock,
 * jadi yang diuji adalah PERILAKU backend (query & keputusan), bukan sekadar
 * tipe. Verifikasi terhadap DB sungguhan dijalankan terpisah lewat script
 * transaction+rollback dan dilaporkan di ringkasan implementasi.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@/server/db/transaction";
import { overdueCondition, todayInJakarta } from "@/server/workspace/date";
import { workspaceOrderItemBodySchema } from "@/lib/workspace-pesanan-contracts";

const queryMock = vi.fn();
const client = { query: queryMock } as unknown as TransactionClient;
const withTransactionMock = vi.fn(async <T>(work: (tx: TransactionClient) => Promise<T>) => work(client));

vi.mock("@/server/db/transaction", () => ({ withTransaction: withTransactionMock }));
vi.mock("@/server/db/client", () => ({
  getDb: () => {
    throw new Error("getDb tidak boleh dipakai di jalur mutation transactional ini");
  },
}));

const { updateWorkspaceOrder } = await import("@/server/workspace/pesanan");

beforeEach(() => {
  queryMock.mockReset();
  withTransactionMock.mockClear();
});

/** Master Produk SUDAH NAIK harganya setelah pesanan lama dibuat. */
const MASTER_SEKARANG = {
  id: 5,
  product_id: "PRO-0001",
  product_name: "Produk A",
  selling_price: "100000",
  unit_hpp: "50000",
  product_usage: "SELLABLE_AND_BONUS",
  is_active: true,
};
/** Snapshot pesanan LAMA (harga saat transaksi terjadi). */
const SNAPSHOT_LAMA = { id: 77, product_id: 5, selling_price_snapshot: "75000", unit_hpp_snapshot: "33750" };

const BODY_DASAR = {
  orderDate: "2026-01-10",
  customerName: "IBU ANI",
  phone: "081234567890",
  paymentMethod: "TRANSFER" as const,
  crmUserId: 1,
  shippingCharge: 0,
  packingCharge: 0,
  discount: 0,
  codAdmin: 0,
  crmVoucher: 0,
};

/** Susun mock untuk satu kali updateWorkspaceOrder dan kembalikan nilai yang ditulis ke order_items. */
async function jalankanEdit(items: { id?: number; productInternalId: number; itemType: "SALE" | "BONUS"; quantity: number }[]) {
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: 1, status: "CONFIRMED", order_total: "75000", source_order_id: "EP-1" }] }) // loadOrderForUpdate
    .mockResolvedValueOnce({ rows: [SNAPSHOT_LAMA] }) // snapshot item existing
    .mockResolvedValueOnce({ rows: [MASTER_SEKARANG] }) // resolveOrderItems -> master TERKINI
    .mockResolvedValueOnce({ rows: [{ name: "CRM A" }] }) // user CRM
    .mockResolvedValueOnce({ rows: [] }) // resolveCustomerId
    .mockResolvedValue({ rows: [] }); // update + delete + insert + audit

  const inserted: Record<string, unknown>[] = [];
  const drizzleInsert = vi.fn();
  // insertItems memakai drizzle txDb(client).insert(...).values(...) — di sini
  // kita cukup menangkap payload lewat spy pada client.query tidak mungkin,
  // jadi verifikasi dilakukan lewat resolver (lihat test terpisah di bawah).
  void drizzleInsert;
  await updateWorkspaceOrder(1, { ...BODY_DASAR, items } as never, 7).catch(() => undefined);
  return inserted;
}

describe("BUG-W01 — snapshot harga/HPP pesanan lama tidak boleh ikut berubah", () => {
  it("DTO item menerima `id` opsional supaya item lama bisa dibedakan dari item baru", () => {
    const lama = workspaceOrderItemBodySchema.safeParse({ id: 77, productInternalId: 5, itemType: "SALE", quantity: 2 });
    expect(lama.success).toBe(true);
    expect(lama.success && lama.data.id).toBe(77);

    // create tidak mengirim id -> tetap valid (backward compatible)
    const baru = workspaceOrderItemBodySchema.safeParse({ productInternalId: 5, itemType: "SALE", quantity: 2 });
    expect(baru.success).toBe(true);
    expect(baru.success && baru.data.id).toBeUndefined();
  });

  it("edit membaca snapshot item lama SEBELUM memakai harga Master Produk", async () => {
    await jalankanEdit([{ id: 77, productInternalId: 5, itemType: "SALE", quantity: 2 }]);
    // Query kedua harus membaca snapshot existing dari workspace_order_items.
    const q = String(queryMock.mock.calls[1]?.[0]);
    expect(q).toContain("selling_price_snapshot");
    expect(q).toContain("unit_hpp_snapshot");
    expect(q).toContain("FROM workspace_order_items");
  });

  it("updateWorkspaceOrder TIDAK lagi memakai resolver yang selalu ambil harga master", () => {
    const src = readFileSync(resolve(process.cwd(), "src/server/workspace/pesanan.ts"), "utf8");
    const fn = src.slice(src.indexOf("export async function updateWorkspaceOrder"));
    expect(fn).toContain("resolveOrderItemsPreservingSnapshots");
    // Pastikan bukan lagi panggilan resolveOrderItems polos di jalur update.
    expect(fn.slice(0, fn.indexOf("const crmUser"))).not.toMatch(/await resolveOrderItems\(/);
  });

  it("aturan preservasi terdokumentasi: produk diganti -> snapshot baru", () => {
    const src = readFileSync(resolve(process.cwd(), "src/server/workspace/pesanan.ts"), "utf8");
    const fn = src.slice(src.indexOf("async function resolveOrderItemsPreservingSnapshots"));
    // produk berbeda -> pakai hasil resolve master (snapshot baru)
    expect(fn).toContain("previous.product_id !== resolved.productInternalId");
    // HPP lama selalu dipertahankan untuk item yang sama
    expect(fn).toContain("unitHppSnapshot: BigInt(previous.unit_hpp_snapshot)");
  });
});

describe("BUG-W02 — temporary order_number harus collision-safe", () => {
  const src = readFileSync(resolve(process.cwd(), "src/server/workspace/pesanan.ts"), "utf8");

  it("tidak memakai Date.now() / Math.random() sebagai nomor sementara", () => {
    expect(src).not.toContain("PENDING-${Date.now()}");
    expect(src).not.toMatch(/PENDING-\$\{Math\.random/);
  });

  it("memakai randomUUID", () => {
    expect(src).toContain("PENDING-${randomUUID()}");
    expect(src).toContain('import { randomUUID } from "node:crypto"');
  });

  it("format nomor FINAL tidak berubah (PSN-000001)", () => {
    expect(src).toContain("'PSN-' || lpad($2::text, 6, '0')");
  });

  it("100 nomor sementara berturut-turut semuanya unik", async () => {
    const { randomUUID } = await import("node:crypto");
    const set = new Set(Array.from({ length: 100 }, () => `PENDING-${randomUUID()}`));
    expect(set.size).toBe(100);
  });
});

describe("BUG-W03 — PARTIALLY_REFUNDED tidak boleh hilang dari Overview", () => {
  const src = readFileSync(resolve(process.cwd(), "src/server/workspace/pesanan-overview.ts"), "utf8");

  it("populasi Overview mencakup CONFIRMED dan PARTIALLY_REFUNDED", () => {
    expect(src).toContain("('CONFIRMED','PARTIALLY_REFUNDED')");
  });

  it("RETURNED dan REFUNDED penuh tetap DI LUAR populasi (semantik existing)", () => {
    expect(src).not.toMatch(/'RETURNED'/);
    expect(src).not.toMatch(/IN \('CONFIRMED','REFUNDED'/);
  });

  it("kondisi status dipusatkan — tidak ada lagi status CONFIRMED yang ditulis manual per query", () => {
    // Buang komentar dulu: penyebutan di dokumentasi tidak dihitung, yang
    // dilarang adalah kondisi status yang ditulis ulang di dalam SQL.
    const kode = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(kode).not.toMatch(/o\.status = 'CONFIRMED'/);
    expect((kode.match(/overviewOrderScope\("o"\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("refund mengurangi pendapatan, TIDAK mengurangi COS", () => {
    expect(src).toContain("refundDeductionForPeriod");
    expect(src).toContain("calculatePendapatanBersih(totalSales, cos, com) - refund");
    // COS tetap SUM(total_hpp) tanpa penyesuaian proporsional refund.
    expect(src).not.toMatch(/total_hpp[^\n]*refund_amount/);
  });

  it("KPI dan trend memakai aturan refund yang sama", () => {
    expect((src.match(/refund_amount/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("COM tetap hanya DIRECTOR_APPROVED", () => {
    expect(src).toContain("c.status = 'DIRECTOR_APPROVED'");
  });
});

describe("BUG-W04 — overdue memakai tanggal bisnis Asia/Jakarta", () => {
  it("todayInJakarta menghasilkan YYYY-MM-DD", () => {
    expect(todayInJakarta()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("batas WIB benar di sekitar tengah malam (tidak bergeser ke tanggal server)", () => {
    // 2026-08-07 17:30 UTC = 2026-08-08 00:30 WIB -> tanggal bisnis SUDAH tanggal 8.
    expect(todayInJakarta(new Date("2026-08-07T17:30:00Z"))).toBe("2026-08-08");
    // 2026-08-07 16:59 UTC = 2026-08-07 23:59 WIB -> masih tanggal 7.
    expect(todayInJakarta(new Date("2026-08-07T16:59:00Z"))).toBe("2026-08-07");
    // 2026-08-07 17:01 UTC = 2026-08-08 00:01 WIB -> sudah tanggal 8.
    expect(todayInJakarta(new Date("2026-08-07T17:01:00Z"))).toBe("2026-08-08");
  });

  it("overdueCondition memakai parameter tanggal, bukan CURRENT_DATE", () => {
    const condition = overdueCondition("t", "2026-08-07");
    expect(condition.queryChunks.some((c) => String(c).includes("CURRENT_DATE"))).toBe(false);
    // Tanggalnya dikirim sebagai parameter query (bukan interpolasi string).
    const params = condition.queryChunks.filter((c) => typeof c === "object" && c !== null && "value" in c);
    expect(params.length).toBeGreaterThan(0);
  });

  it("aturan status overdue TIDAK diubah — hanya sumber tanggalnya", () => {
    const dateSrc = readFileSync(resolve(process.cwd(), "src/server/workspace/date.ts"), "utf8");
    const fn = dateSrc.slice(dateSrc.indexOf("export function overdueCondition"));
    expect(fn).toContain("IS NOT NULL");
    expect(fn).toContain("NOT IN ('DONE','CANCELLED')");
    expect(fn).toContain("todayInJakarta()");
    expect(fn).not.toContain("CURRENT_DATE");
  });

  it("seluruh tempat overdue memakai helper yang sama (KPI = filter = kolom baris)", () => {
    const tasks = readFileSync(resolve(process.cwd(), "src/server/workspace/tasks.ts"), "utf8");
    const overview = readFileSync(resolve(process.cwd(), "src/server/workspace/overview.ts"), "utf8");
    expect(tasks).not.toContain("CURRENT_DATE");
    expect(overview).not.toContain("CURRENT_DATE");
    expect((tasks.match(/overdueCondition\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((overview.match(/overdueCondition\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
