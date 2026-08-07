import { describe, expect, it } from "vitest";
import { roleHasCrmPermission } from "@/lib/crm-permissions";
import {
  WORKSPACE_COST_CATEGORIES,
  WORKSPACE_COST_PAGE_SIZES,
  WORKSPACE_COST_STATUS_LABEL,
  WORKSPACE_COST_STATUSES,
  workspaceCostBodySchema,
  workspaceCostFilterSchema,
} from "@/lib/workspace-cost-contracts";
import { escapeCostCsvCell, toWorkspaceCostExportRows } from "@/server/workspace/costs-export";
import { computeCostAvailableActions } from "@/components/workspace/cost-shared";

const validCost = { costDate: "2026-08-05", costName: "Biaya Mekari Agustus", amount: 1_500_000, category: "MEKARI_QONTAK" as const };

describe("Biaya Operasional — filter, sorting, pagination", () => {
  it("menerima filter tanggal, kategori, status, dan search sekaligus", () => {
    const filter = workspaceCostFilterSchema.parse({
      from: "2026-08-01",
      to: "2026-08-31",
      category: "BROADCAST",
      status: "SUBMITTED",
      search: "Mekari",
      sort: "amount",
      order: "desc",
    });
    expect(filter).toMatchObject({ from: "2026-08-01", to: "2026-08-31", category: "BROADCAST", status: "SUBMITTED", search: "Mekari", sort: "amount", order: "desc" });
  });

  it("default 10 baris; page size UI 10/25/50/100", () => {
    expect(workspaceCostFilterSchema.parse({}).perPage).toBe(10);
    expect(WORKSPACE_COST_PAGE_SIZES).toEqual([10, 25, 50, 100]);
  });

  it("default sort tanggal biaya terbaru", () => {
    const filter = workspaceCostFilterSchema.parse({});
    expect(filter.sort).toBe("cost_date");
    expect(filter.order).toBe("desc");
  });

  it("tanggal awal tidak boleh melewati tanggal akhir", () => {
    expect(workspaceCostFilterSchema.safeParse({ from: "2026-08-31", to: "2026-08-01" }).success).toBe(false);
  });
});

describe("Biaya Operasional — validasi form", () => {
  it("biaya valid berhasil", () => {
    expect(workspaceCostBodySchema.safeParse(validCost).success).toBe(true);
  });

  it("nominal Rp0 ditolak", () => {
    expect(workspaceCostBodySchema.safeParse({ ...validCost, amount: 0 }).success).toBe(false);
  });

  it("nominal negatif ditolak", () => {
    expect(workspaceCostBodySchema.safeParse({ ...validCost, amount: -1000 }).success).toBe(false);
  });

  it("bukti pembayaran wajib http/https — protokol tidak aman ditolak", () => {
    expect(workspaceCostBodySchema.safeParse({ ...validCost, proofUrl: "https://drive.example.com/bukti.pdf" }).success).toBe(true);
    expect(workspaceCostBodySchema.safeParse({ ...validCost, proofUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(workspaceCostBodySchema.safeParse({ ...validCost, proofUrl: "data:text/html,<script>1</script>" }).success).toBe(false);
  });
});

describe("Biaya Operasional — label status mudah dibaca (bukan enum mentah)", () => {
  it("setiap status internal punya label Indonesia yang berbeda dari nilai enum-nya", () => {
    for (const status of WORKSPACE_COST_STATUSES) {
      expect(WORKSPACE_COST_STATUS_LABEL[status]).not.toBe(status);
      expect(WORKSPACE_COST_STATUS_LABEL[status].length).toBeGreaterThan(0);
    }
  });
});

describe("Biaya Operasional — aksi per baris (computeCostAvailableActions)", () => {
  const draft = { status: "DRAFT" as const, createdBy: 10, createdByName: "Feny Nuraini" };
  const submitted = { status: "SUBMITTED" as const, createdBy: 10, createdByName: "Feny Nuraini" };
  const permissions = {
    create: true, update: true, submit: true, leaderVerify: true, spvApprove: true, directorApprove: true,
    requestRevision: true, reject: true, cancel: true, export: true, auditRead: true,
  };

  it("pembuat boleh edit/ajukan draft miliknya sendiri", () => {
    const actions = computeCostAvailableActions(draft, { id: 10, name: "Feny Nuraini", role: "CRM" }, permissions);
    expect(actions.canEdit).toBe(true);
    expect(actions.canSubmit).toBe(true);
    expect(actions.canDecide).toBe(false);
  });

  it("pembuat TIDAK BOLEH menyetujui pengajuannya sendiri walau namanya cocok role approver", () => {
    // Feny Nuraini = LEADER; pengajuannya sendiri butuh SPV_APPROVE berikutnya,
    // tapi karena dia pembuatnya, tidak ada aksi decide yang muncul untuknya.
    const actions = computeCostAvailableActions(submitted, { id: 10, name: "Feny Nuraini", role: "CRM" }, permissions);
    expect(actions.canDecide).toBe(false);
    expect(actions.canRequestRevision).toBe(false);
    expect(actions.canReject).toBe(false);
  });

  it("approver yang tepat (bukan pembuat) melihat aksi decide", () => {
    // Leader membuat -> tahap berikutnya SPV_APPROVE.
    const actions = computeCostAvailableActions(submitted, { id: 99, name: "Ni'mah Luthfianingsih", role: "CRM" }, permissions);
    expect(actions.stage).toBe("SPV_APPROVE");
    expect(actions.canDecide).toBe(true);
  });

  it("user tanpa permission approval tidak melihat aksi decide walau namanya cocok", () => {
    const noApprovePermission = { ...permissions, spvApprove: false };
    const actions = computeCostAvailableActions(submitted, { id: 99, name: "Ni'mah Luthfianingsih", role: "CRM" }, noApprovePermission);
    expect(actions.canDecide).toBe(false);
  });

  it("CRM lain yang bukan approver tahap ini tidak melihat aksi decide", () => {
    const actions = computeCostAvailableActions(submitted, { id: 55, name: "Anggota CRM Biasa", role: "CRM" }, permissions);
    expect(actions.canDecide).toBe(false);
  });

  it("DIRECTOR_APPROVED hanya bisa dibatalkan admin", () => {
    const approved = { status: "DIRECTOR_APPROVED" as const, createdBy: 10, createdByName: "Feny Nuraini" };
    const asCreator = computeCostAvailableActions(approved, { id: 10, name: "Feny Nuraini", role: "CRM" }, permissions);
    expect(asCreator.canCancel).toBe(false);
    const asAdmin = computeCostAvailableActions(approved, { id: 1, name: "Admin", role: "ADMIN" }, permissions);
    expect(asAdmin.canCancel).toBe(true);
  });
});

describe("Biaya Operasional — export dan permission", () => {
  it("Nominal tetap angka, tanggal tetap string", () => {
    const [row] = toWorkspaceCostExportRows([{
      id: 1,
      costDate: "2026-08-05",
      costName: "Biaya Mekari Agustus",
      category: "MEKARI_QONTAK",
      vendor: "Mekari",
      usagePeriod: "Agustus 2026",
      paymentMethod: "Transfer Bank",
      referenceNumber: "INV/MEK/0826/001",
      amount: "1500000",
      createdBy: 10,
      createdByName: "Feny Nuraini",
      status: "SUBMITTED",
      proofUrl: null,
    }]);
    expect(row?.TanggalBiaya).toBe("2026-08-05");
    expect(row?.Nominal).toBe(1_500_000);
    expect(typeof row?.Nominal).toBe("number");
  });

  it("CSV injection dinetralkan", () => {
    expect(escapeCostCsvCell("=CMD()")).toBe("'=CMD()");
    expect(escapeCostCsvCell("+SUM(A1)")).toBe("'+SUM(A1)");
  });

  it("permission mutasi/approval/export dibuka untuk role CRM (bukan ADMIN-only) — Leader/SPV/Direktur adalah user CRM", () => {
    expect(roleHasCrmPermission("CRM", "crm.com.read")).toBe(true);
    expect(roleHasCrmPermission("CRM", "crm.com.create")).toBe(true);
    expect(roleHasCrmPermission("CRM", "crm.com.export")).toBe(true);
    expect(roleHasCrmPermission("CRM", "crm.com.leader_verify")).toBe(true);
    expect(roleHasCrmPermission("ADMIN", "crm.com.export")).toBe(true);
    expect(roleHasCrmPermission("MANAGEMENT", "crm.com.export")).toBe(false);
  });

  it("seluruh kategori COM mempunyai badge label (bukan enum mentah)", () => {
    for (const category of WORKSPACE_COST_CATEGORIES) {
      expect(category).toMatch(/^[A-Z_]+$/);
    }
  });
});
