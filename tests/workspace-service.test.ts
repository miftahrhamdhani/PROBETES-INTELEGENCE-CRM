import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@/server/db/transaction";

const queryMock = vi.fn();
const client = { query: queryMock } as unknown as TransactionClient;
const withTransactionMock = vi.fn(async <T>(work: (tx: TransactionClient) => Promise<T>) => work(client));
const recalculateMock = vi.fn();

vi.mock("@/server/db/transaction", () => ({
  withTransaction: withTransactionMock,
}));
vi.mock("@/server/db/client", () => ({
  getDb: () => {
    throw new Error("getDb tidak boleh dipakai mutation transactional");
  },
}));
vi.mock("@/server/import/orchestrator", () => ({
  recalculateClusterForCustomer: recalculateMock,
}));

const {
  InvalidAssigneeError,
  InvalidTransitionError,
  assignTask,
  bulkSetTaskStatus,
  completeTask,
  confirmJoinedGroupFromTask,
} = await import("@/server/workspace/tasks");

beforeEach(() => {
  queryMock.mockReset();
  withTransactionMock.mockClear();
  recalculateMock.mockReset();
});

describe("Workspace service — invariant DB dan concurrency", () => {
  it("assign menolak user nonaktif/non-operasional sebelum update", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status: "UNASSIGNED", assigned_to: null, due_at: null }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(assignTask(1, { assignedTo: 99 }, 7)).rejects.toBeInstanceOf(InvalidAssigneeError);
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("FOR UPDATE");
    expect(String(queryMock.mock.calls[1]?.[0])).toContain("active = true");
  });

  it("bulk status mengunci snapshot dan hanya membuat history untuk row valid", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          { id: 1, status: "ASSIGNED", assigned_to: 8 },
          { id: 2, status: "DONE", assigned_to: 8 },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(bulkSetTaskStatus([1, 2, 404], "CANCELLED", 7)).resolves.toEqual({ updated: 1, skipped: 2 });
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("FOR UPDATE");
    expect(queryMock.mock.calls[1]?.[1]).toEqual([[1], "CANCELLED", false]);
    expect(queryMock.mock.calls[2]?.[1]).toEqual([[1], ["ASSIGNED"], "CANCELLED", 7]);
  });

  it("bulk UNASSIGNED membersihkan seluruh metadata assignment", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1, status: "ASSIGNED", assigned_to: 8 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await bulkSetTaskStatus([1], "UNASSIGNED", 7);
    expect(String(queryMock.mock.calls[1]?.[0])).toContain("assigned_to = CASE WHEN $3 THEN NULL");
    expect(String(queryMock.mock.calls[1]?.[0])).toContain("assigned_by = CASE WHEN $3 THEN NULL");
    expect(String(queryMock.mock.calls[1]?.[0])).toContain("assigned_at = CASE WHEN $3 THEN NULL");
    expect(queryMock.mock.calls[1]?.[1]).toEqual([[1], "UNASSIGNED", true]);
  });

  it("completeTask menolak laporan beda customer/arsip/tertutup lalu rollback task", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status: "IN_PROGRESS", customer_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] }) // lookup crm_reconciliations RECONCILED
      .mockResolvedValueOnce({ rows: [] }); // UPDATE crm_reports gagal (0 baris)

    await expect(
      completeTask(1, { outcome: "CLOSING", linkedReportId: 22 }, 7)
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(String(queryMock.mock.calls[1]?.[0])).toContain("crm_reconciliations");
    expect(String(queryMock.mock.calls[2]?.[0])).toContain("customer_id = $3");
    expect(String(queryMock.mock.calls[2]?.[0])).toContain("archived_at IS NULL");
    expect(String(queryMock.mock.calls[2]?.[0])).toContain("RETURNING id");
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it("confirm JOINED_GROUP wajib task DONE + JOINED_GROUP dan row lock", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ customer_id: 10, status: "IN_PROGRESS", outcome: "JOINED_GROUP" }] });

    await expect(
      confirmJoinedGroupFromTask(1, { groupName: null, joinedAt: null, notes: null }, 7)
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("FOR UPDATE");
    expect(recalculateMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
