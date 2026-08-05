import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@/server/db/transaction";

const client = { query: vi.fn() } as unknown as TransactionClient;
const withTransactionMock = vi.fn(async <T>(work: (tx: TransactionClient) => Promise<T>) => work(client));
const getDbMock = vi.fn();
const drizzleMock = vi.fn();

vi.mock("@/server/db/transaction", () => ({
  withTransaction: withTransactionMock,
}));
vi.mock("@/server/db/client", () => ({
  getDb: getDbMock,
}));
vi.mock("drizzle-orm/neon-serverless", () => ({
  drizzle: drizzleMock,
}));

const { buildExportRows, createReport, updateReport } = await import("@/server/crm-report/service");

const report = {
  customerName: "CUSTOMER",
  phone: "INVALID",
  items: [{ productName: "PRODUK", qty: 1, productValue: 1000 }],
  shippingCost: 0,
  packingCost: 0,
  discount: 0,
  adminCod: 0,
  reportDate: "2026-08-05",
};

describe("CRM Report service — transaction boundary", () => {
  beforeEach(() => {
    withTransactionMock.mockClear();
    getDbMock.mockClear();
    drizzleMock.mockReset();
  });

  it("create menjalankan header dan item pada client transaction yang sama", async () => {
    const itemInsert = vi.fn().mockResolvedValue(undefined);
    const db = {
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 42 }]) })) })
        .mockReturnValueOnce({ values: itemInsert }),
    };
    drizzleMock.mockReturnValue(db);

    await expect(createReport(report, 7)).resolves.toBe(42);
    expect(withTransactionMock).toHaveBeenCalledOnce();
    expect(drizzleMock).toHaveBeenCalledWith(client);
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("update menjalankan header, delete item, insert ulang dalam satu transaction", async () => {
    const where = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 42 }]) }));
    const itemDeleteWhere = vi.fn().mockResolvedValue(undefined);
    const itemInsert = vi.fn().mockResolvedValue(undefined);
    const db = {
      update: vi.fn(() => ({ set: vi.fn(() => ({ where })) })),
      delete: vi.fn(() => ({ where: itemDeleteWhere })),
      insert: vi.fn(() => ({ values: itemInsert })),
    };
    drizzleMock.mockReturnValue(db);

    await expect(updateReport(42, report, 7)).resolves.toBeUndefined();
    expect(withTransactionMock).toHaveBeenCalledOnce();
    expect(drizzleMock).toHaveBeenLastCalledWith(client);
    expect(db.update).toHaveBeenCalledOnce();
    expect(db.delete).toHaveBeenCalledOnce();
    expect(db.insert).toHaveBeenCalledOnce();
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("export mempertahankan field BIGINT sebagai decimal-string", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [{
        customer_name: "A",
        shipping_cost: "9007199254740993",
        packing_cost: "0",
        discount: "0",
        admin_cod: "0",
        total_payment: "9007199254740993",
        cod_value: "9007199254740993",
        crm_marketing_cost: "9007199254740993",
        items: [{ name: "P", qty: "1", value: "9007199254740993" }],
      }],
    });
    getDbMock.mockReturnValueOnce({ execute } as never);

    const rows = await buildExportRows({});
    expect(rows[0]?.Ongkir).toBe("9007199254740993");
    expect(rows[0]?.TotalBayar).toBe("9007199254740993");
    expect(rows[0]?.NilaiProduk1).toBe("9007199254740993");
  });
});
