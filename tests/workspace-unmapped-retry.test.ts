import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@/server/db/transaction";

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

const EMPTY_SUMMARY = {
  ordersIngested: 0,
  ordersConvertedFromManual: 0,
  ordersSkippedUnmappedProduct: 0,
  ordersSkippedNegativeTotal: 0,
  ordersHeldAdjustedStatus: 0,
  unmappedProductNames: 0,
};

function canonicalOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    source_order_key: "2026-08-01|628123456789",
    order_date: "2026-08-01",
    order_total: "150000",
    workspace_total: "150000",
    platform: "WA",
    division: "CRM",
    payment_method: "COD",
    partner: null,
    memo: null,
    city: "Jakarta",
    hub: "JKT",
    sales_type: "CS",
    shipping_cost: "10000",
    packing_cost: "0",
    discount: "0",
    admin_cod: "5000",
    crm_marketing_cost: "0",
    order_closing_count: 1,
    transaction_status: "CONFIRMED",
    is_crm_transaction: true,
    crm_inclusion_reason: "CRM",
    source_batch_id: 7,
    cs_name: "Sarah",
    normalized_phone: "628123456789",
    display_phone: "08123456789",
    customer_name: "Budi",
    ...overrides,
  };
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    order_id: 1,
    source_item_key: "key-1",
    source_row_number: 12,
    external_id: null,
    raw_product_name: "Herbal Probetes",
    qty: "2",
    amount: "150000",
    is_bonus: false,
    identity_confidence: "HIGH",
    ...overrides,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  ingestMock.mockReset();
});

describe("retry order untuk produk yang baru dipetakan (§K)", () => {
  it("tidak memanggil ingest sama sekali kalau tidak ada order terdampak", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await retryOrdersForResolvedProduct(client, "HERBAL PROBETES", "Herbal Probetes");

    expect(ingestMock).not.toHaveBeenCalled();
    expect(result.candidateOrders).toBe(0);
    expect(result.ordersIngested).toBe(0);
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

  it("hanya me-replay order yang diklasifikasi CRM", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await retryOrdersForResolvedProduct(client, "X", "X");
    expect(String(queryMock.mock.calls[0]![0])).toContain("o.is_crm_transaction = true");
  });

  it("meneruskan order kanonik apa adanya ke ingest yang idempoten", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [canonicalOrderRow()] })
      .mockResolvedValueOnce({ rows: [itemRow()] })
      .mockResolvedValueOnce({ rows: [] });
    ingestMock.mockResolvedValueOnce({ ...EMPTY_SUMMARY, ordersIngested: 1 });

    const result = await retryOrdersForResolvedProduct(client, "HERBAL PROBETES", "Herbal Probetes");

    expect(ingestMock).toHaveBeenCalledTimes(1);
    const [, orders, batchId] = ingestMock.mock.calls[0]!;
    expect(batchId).toBe(7);
    expect(orders).toHaveLength(1);
    expect(orders[0].sourceOrderKey).toBe("2026-08-01|628123456789");
    expect(orders[0].normalizedPhone).toBe("628123456789");
    expect(orders[0].orderDate).toBe("2026-08-01");
    // Uang wajib bigint (CLAUDE.md #7), bukan number.
    expect(typeof orders[0].shippingCost).toBe("bigint");
    expect(orders[0].adminCod).toBe(5000n);
    expect(orders[0].items).toHaveLength(1);
    expect(orders[0].items[0].rawProductName).toBe("Herbal Probetes");
    expect(orders[0].items[0].amount).toBe(150000n);
    expect(result.ordersIngested).toBe(1);
  });

  it("melaporkan order yang MASIH tertahan produk tak dikenal lain, bukan menganggapnya sukses", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [canonicalOrderRow()] })
      .mockResolvedValueOnce({ rows: [itemRow(), itemRow({ source_item_key: "key-2", raw_product_name: "Produk Misterius" })] })
      .mockResolvedValueOnce({ rows: [{ raw_product_name: "Produk Misterius" }] });
    ingestMock.mockResolvedValueOnce({ ...EMPTY_SUMMARY, ordersSkippedUnmappedProduct: 1 });

    const result = await retryOrdersForResolvedProduct(client, "HERBAL PROBETES", "Herbal Probetes");

    expect(result.ordersIngested).toBe(0);
    expect(result.ordersStillBlocked).toBe(1);
    expect(result.blockingProductNames).toEqual(["Produk Misterius"]);
  });

  it("meneruskan order yang ditahan karena status ADJUSTED tanpa membuat order sebagian", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [canonicalOrderRow({ transaction_status: "ADJUSTED" })] })
      .mockResolvedValueOnce({ rows: [itemRow()] })
      .mockResolvedValueOnce({ rows: [] });
    ingestMock.mockResolvedValueOnce({ ...EMPTY_SUMMARY, ordersHeldAdjustedStatus: 1 });

    const result = await retryOrdersForResolvedProduct(client, "HERBAL PROBETES", "Herbal Probetes");

    expect(result.ordersIngested).toBe(0);
    expect(result.ordersHeldAdjustedStatus).toBe(1);
  });

  it("idempoten: dua kali retry berturut-turut memakai jalur dedup ingest yang sama", async () => {
    const setup = () =>
      queryMock
        .mockResolvedValueOnce({ rows: [canonicalOrderRow()] })
        .mockResolvedValueOnce({ rows: [itemRow()] })
        .mockResolvedValueOnce({ rows: [] });

    setup();
    ingestMock.mockResolvedValueOnce({ ...EMPTY_SUMMARY, ordersIngested: 1 });
    const first = await retryOrdersForResolvedProduct(client, "HERBAL PROBETES", "Herbal Probetes");

    setup();
    // Klik kedua: ingest mendedup lewat (source_type, source_order_id) sehingga
    // tidak ada order baru yang dibuat.
    ingestMock.mockResolvedValueOnce({ ...EMPTY_SUMMARY, ordersIngested: 0 });
    const second = await retryOrdersForResolvedProduct(client, "HERBAL PROBETES", "Herbal Probetes");

    expect(first.ordersIngested).toBe(1);
    expect(second.ordersIngested).toBe(0);
    const firstOrders = ingestMock.mock.calls[0]![1] as { sourceOrderKey: string }[];
    const secondOrders = ingestMock.mock.calls[1]![1] as { sourceOrderKey: string }[];
    expect(secondOrders[0]!.sourceOrderKey).toBe(firstOrders[0]!.sourceOrderKey);
  });
});
