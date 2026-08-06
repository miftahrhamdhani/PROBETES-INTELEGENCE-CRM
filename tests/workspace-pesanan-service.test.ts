import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@/server/db/transaction";

/**
 * Regresi BUG "pesanan tanpa No Order berstatus CONFIRMED/CANCELLED": No Order/
 * ID Pesanan Everpro (source_order_id) adalah kunci tracking, jadi status
 * selain DRAFT WAJIB baru boleh terjadi kalau source_order_id sudah terisi —
 * ditegakkan di confirmWorkspaceOrder/cancelWorkspaceOrder (di sini) DAN oleh
 * CHECK workspace_orders_status_requires_source_order_id_ck di schema.ts
 * (lapis kedua, tidak bisa dites tanpa DB sungguhan).
 */
const queryMock = vi.fn();
const client = { query: queryMock } as unknown as TransactionClient;
const withTransactionMock = vi.fn(async <T>(work: (tx: TransactionClient) => Promise<T>) => work(client));

vi.mock("@/server/db/transaction", () => ({
  withTransaction: withTransactionMock,
}));
vi.mock("@/server/db/client", () => ({
  getDb: () => {
    throw new Error("getDb tidak boleh dipakai di jalur mutation transactional ini");
  },
}));

const { cancelWorkspaceOrder, confirmWorkspaceOrder, WorkspaceOrderStateError, WorkspaceOrderValidationError } = await import(
  "@/server/workspace/pesanan"
);

beforeEach(() => {
  queryMock.mockReset();
  withTransactionMock.mockClear();
});

describe("confirmWorkspaceOrder — wajib No Order/ID Pesanan terisi (fitur tracking Everpro)", () => {
  it("menolak konfirmasi kalau source_order_id kosong, tanpa sempat UPDATE", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1, status: "DRAFT", order_total: "54000", source_order_id: null }] });

    await expect(confirmWorkspaceOrder(1, 7)).rejects.toBeInstanceOf(WorkspaceOrderValidationError);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("FOR UPDATE");
  });

  it("berhasil konfirmasi kalau source_order_id sudah ada", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1, status: "DRAFT", order_total: "54000", source_order_id: "EP-000123" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await confirmWorkspaceOrder(1, 7);
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(String(queryMock.mock.calls[1]?.[0])).toContain("status='CONFIRMED'");
  });

  it("menolak konfirmasi ulang pesanan yang sudah CONFIRMED", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1, status: "CONFIRMED", order_total: "54000", source_order_id: "EP-000123" }] });

    await expect(confirmWorkspaceOrder(1, 7)).rejects.toBeInstanceOf(WorkspaceOrderStateError);
  });
});

describe("cancelWorkspaceOrder — wajib No Order/ID Pesanan terisi (fitur tracking Everpro)", () => {
  it("menolak pembatalan kalau source_order_id kosong — draft yang tidak jadi harus dihapus, bukan dibatalkan", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1, status: "DRAFT", order_total: "54000", source_order_id: null }] });

    await expect(cancelWorkspaceOrder(1, 7, null)).rejects.toBeInstanceOf(WorkspaceOrderValidationError);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("berhasil membatalkan kalau source_order_id sudah ada", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1, status: "CONFIRMED", order_total: "54000", source_order_id: "EP-000123" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await cancelWorkspaceOrder(1, 7, "Customer batal");
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(String(queryMock.mock.calls[1]?.[0])).toContain("status='CANCELLED'");
  });

  it("menolak pembatalan ulang pesanan yang sudah CANCELLED", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1, status: "CANCELLED", order_total: "54000", source_order_id: "EP-000123" }] });

    await expect(cancelWorkspaceOrder(1, 7, null)).rejects.toBeInstanceOf(WorkspaceOrderStateError);
  });
});
