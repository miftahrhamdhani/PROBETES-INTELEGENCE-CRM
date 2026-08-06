import { describe, expect, it } from "vitest";
import { mapImportStatusToWorkspace, type ImportTransactionStatus } from "@/lib/workspace-import-status";

describe("mapImportStatusToWorkspace — mapping status import Database All (perbaikan §5)", () => {
  it("CONFIRMED -> CONFIRMED", () => {
    expect(mapImportStatusToWorkspace("CONFIRMED")).toEqual({ action: "INSERT", status: "CONFIRMED" });
  });

  it("CANCELLED -> CANCELLED", () => {
    expect(mapImportStatusToWorkspace("CANCELLED")).toEqual({ action: "INSERT", status: "CANCELLED" });
  });

  it("COD_FAILED -> CANCELLED (tidak pernah closing)", () => {
    expect(mapImportStatusToWorkspace("COD_FAILED")).toEqual({ action: "INSERT", status: "CANCELLED" });
  });

  it("RETURNED -> RETURNED, bukan digabung ke CONFIRMED", () => {
    expect(mapImportStatusToWorkspace("RETURNED")).toEqual({ action: "INSERT", status: "RETURNED" });
  });

  it("REFUNDED -> REFUNDED, bukan digabung ke CONFIRMED", () => {
    expect(mapImportStatusToWorkspace("REFUNDED")).toEqual({ action: "INSERT", status: "REFUNDED" });
  });

  it("PARTIALLY_REFUNDED -> PARTIALLY_REFUNDED, bukan digabung ke CONFIRMED", () => {
    expect(mapImportStatusToWorkspace("PARTIALLY_REFUNDED")).toEqual({ action: "INSERT", status: "PARTIALLY_REFUNDED" });
  });

  it("ADJUSTED ditahan (HOLD) dengan alasan eksplisit, tidak ditebak jadi CONFIRMED", () => {
    const result = mapImportStatusToWorkspace("ADJUSTED");
    expect(result.action).toBe("HOLD");
    if (result.action === "HOLD") {
      expect(result.reason).toMatch(/adjustment/i);
    }
  });

  it("hanya CONFIRMED yang menjadi target status untuk KPI eligibility", () => {
    const allStatuses: ImportTransactionStatus[] = ["CONFIRMED", "CANCELLED", "COD_FAILED", "RETURNED", "REFUNDED", "PARTIALLY_REFUNDED"];
    const mappedToConfirmed = allStatuses.filter((status) => {
      const mapping = mapImportStatusToWorkspace(status);
      return mapping.action === "INSERT" && mapping.status === "CONFIRMED";
    });
    expect(mappedToConfirmed).toEqual(["CONFIRMED"]);
  });
});
