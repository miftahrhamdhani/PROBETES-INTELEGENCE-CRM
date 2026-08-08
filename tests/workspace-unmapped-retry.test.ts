import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@/server/db/transaction";

/**
 * Regresi DATA LEAK: retry produk tak dikenal adalah PINTU BELAKANG kedua yang
 * membuat order berprovenance DATABASE_ALL masuk ke Workspace Pesanan — bukan
 * cuma commit Database All. Dulu ia merehidrasi order kanonik jadi
 * NormalizedDailyOrder lalu menyerahkannya ke ingestWorkspaceOrdersFromImport,
 * yang menulis workspace_orders/workspace_order_items.
 *
 * Jalur itu dicabut. Test ini mengunci agar retry tetap MURNI BACA: melaporkan
 * dampak ke domain legacy/Analysis, tanpa satu pun tulisan ke Workspace.
 */
const queryMock = vi.fn();
const client = { query: queryMock } as unknown as TransactionClient;
const ingestMock = vi.fn();

vi.mock("@/server/workspace/pesanan-import", () => ({
  ingestWorkspaceOrdersFromImport: (...args: unknown[]) => ingestMock(...args),
}));
vi.mock("@/server/db/client", () => ({
  getDb: () => {
    throw new Error("retry unmapped harus lewat transaction client, bukan getDb()");
  },
}));

const { retryOrdersForResolvedProduct } = await import("@/server/workspace/unmapped-retry");

/** Semua SQL yang benar-benar dikirim retry ke database. */
function executedSql(): string[] {
  return queryMock.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  queryMock.mockReset();
  ingestMock.mockReset();
});

describe("retry produk yang baru dipetakan — tidak pernah menyentuh Workspace (§K + batas domain)", () => {
  it("tidak memanggil ingest Workspace sama sekali kalau tidak ada order terdampak", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await retryOrdersForResolvedProduct(client, "HERBAL PROBETES", "Herbal Probetes");

    expect(ingestMock).not.toHaveBeenCalled();
    expect(result.candidateOrders).toBe(0);
    expect(result.ordersIngested).toBe(0);
  });

  it("TIDAK memanggil ingest Workspace walau ada order kanonik terdampak", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ blocked: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await retryOrdersForResolvedProduct(client, "HERBAL PROBETES", "Herbal Probetes");

    expect(ingestMock).not.toHaveBeenCalled();
    expect(result.candidateOrders).toBe(2);
    // Order Workspace tidak pernah dibuat/dikonversi dari jalur legacy.
    expect(result.ordersIngested).toBe(0);
    expect(result.ordersConvertedFromManual).toBe(0);
  });

  it("tidak menulis apa pun ke workspace_orders / workspace_order_items", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ blocked: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    await retryOrdersForResolvedProduct(client, "HERBAL PROBETES", "Herbal Probetes");

    for (const text of executedSql()) {
      expect(text, `retry mengirim SQL yang menulis Workspace:\n${text}`).not.toMatch(/workspace_orders|workspace_order_items/);
      expect(text, `retry mengirim SQL tulis:\n${text}`).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    }
  });

  it("mencocokkan nama mentah memakai normalisasi UPPERCASE yang sama dengan alias", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await retryOrdersForResolvedProduct(client, "HERBAL PROBETES", "Herbal Probetes");

    const [sqlText, params] = queryMock.mock.calls[0]!;
    // normalizeProductAlias() = trim + UPPERCASE + rapatkan spasi. Kalau SQL-nya
    // memakai lower(), join alias tidak akan pernah cocok dan retry diam-diam
    // tidak menemukan order apa pun.
    expect(String(sqlText)).toContain("upper(");
    expect(String(sqlText)).not.toContain("lower(");
    expect(params).toEqual(["HERBAL PROBETES"]);
  });

  it("hanya menghitung order yang diklasifikasi CRM", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await retryOrdersForResolvedProduct(client, "X", "X");
    expect(String(queryMock.mock.calls[0]![0])).toContain("o.is_crm_transaction = true");
  });

  it("melaporkan order yang MASIH tertahan produk tak dikenal lain, bukan menganggapnya sukses", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ blocked: "1" }] })
      .mockResolvedValueOnce({ rows: [{ raw_product_name: "Produk Misterius" }] });

    const result = await retryOrdersForResolvedProduct(client, "HERBAL PROBETES", "Herbal Probetes");

    expect(result.ordersIngested).toBe(0);
    expect(result.ordersStillBlocked).toBe(1);
    expect(result.blockingProductNames).toEqual(["Produk Misterius"]);
  });

  it("idempoten secara trivial: dua kali retry menghasilkan laporan identik", async () => {
    const setup = () =>
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ blocked: "0" }] })
        .mockResolvedValueOnce({ rows: [] });

    setup();
    const first = await retryOrdersForResolvedProduct(client, "HERBAL PROBETES", "Herbal Probetes");
    setup();
    const second = await retryOrdersForResolvedProduct(client, "HERBAL PROBETES", "Herbal Probetes");

    expect(second).toEqual(first);
    expect(ingestMock).not.toHaveBeenCalled();
  });
});
