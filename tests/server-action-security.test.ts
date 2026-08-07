/**
 * Server Action = endpoint POST publik. Middleware menyaring per-PATH, sedangkan
 * action id Next.js bersifat GLOBAL — action apa pun bisa dipanggil lewat POST ke
 * path mana pun yang boleh diakses pemanggil. Karena itu setiap action wajib
 * punya authorization sendiri.
 *
 * Test ini memanggil action SECARA LANGSUNG (persis seperti penyerang yang
 * mengirim action id ke route yang dia boleh akses) dan memastikan:
 *   - MANAGEMENT tidak bisa membaca PII (nama/No.HP/alamat/riwayat transaksi)
 *   - unauthenticated ditolak di semua action
 *   - guard berjalan SEBELUM DB tersentuh (DB dimock supaya melempar)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/lib/roles";

const sessionMock = vi.fn<() => Promise<{ user?: { id?: string; email?: string; name?: string; role?: UserRole } } | null>>();

vi.mock("@/server/auth/index", () => ({ auth: () => sessionMock() }));

/** requireSession memverifikasi akun masih aktif ke DB (agar user yang
 *  dinonaktifkan langsung kehilangan akses walau JWT-nya belum kedaluwarsa).
 *  Di test ini akun selalu dianggap aktif supaya yang diuji murni ROLE. */
const activeMock = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
vi.mock("@/server/auth/admin", () => ({ isUserActive: () => activeMock() }));

/** Kalau guard bocor, query DB akan jalan dan melempar penanda ini — sehingga
 *  test gagal dengan pesan yang jelas, bukan lolos diam-diam. */
const DB_TOUCHED = "GUARD BOCOR: query DB dijalankan sebelum authorization";
vi.mock("@/server/db/client", () => ({
  getDb: () => {
    throw new Error(DB_TOUCHED);
  },
}));
vi.mock("@/server/db/transaction", () => ({
  withTransaction: () => {
    throw new Error(DB_TOUCHED);
  },
}));

function loginAs(role: UserRole) {
  sessionMock.mockResolvedValue({ user: { id: "9", email: "x@y.z", name: "X", role } });
}
function loggedOut() {
  sessionMock.mockResolvedValue(null);
}

const customers = await import("@/app/customers-actions");
const workspace = await import("@/app/workspace-actions");
const analytics = await import("@/app/analytics-actions");
const importAdmin = await import("@/app/import-admin-actions");
const pesanan = await import("@/app/workspace-pesanan-actions");
const masterData = await import("@/app/workspace-master-data-actions");
const costs = await import("@/app/workspace-cost-actions");
const overview = await import("@/app/workspace-overview-actions");
const workspaceAudit = await import("@/app/workspace-audit-actions");
const reconciliation = await import("@/app/reconciliation-actions");

const validOrderBody = {
  orderDate: "2026-08-05",
  customerName: "BUDI",
  phone: "081234567890",
  paymentMethod: "TRANSFER" as const,
  crmUserId: 1,
  items: [{ productInternalId: 1, itemType: "SALE" as const, quantity: 1 }],
};
const validProductBody = { productName: "PRODUK", sellingPrice: 10000, unitHpp: 5000, productUsage: "SELLABLE" as const, isActive: true };
const validCostBody = { costDate: "2026-08-05", costName: "BIAYA", amount: 10000, category: "COM_LAINNYA" as const };

/** [nama, pemanggil] — argumen sengaja valid supaya kegagalan benar-benar
 *  berasal dari authorization, bukan dari validasi bentuk. */
const PII_ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ["customers.searchCustomersQuickAction", () => customers.searchCustomersQuickAction("budi")],
  ["customers.loadCustomerList", () => customers.loadCustomerList({})],
  ["customers.loadCustomerListPage", () => customers.loadCustomerListPage({}, 1)],
  ["customers.loadCustomerDetail", () => customers.loadCustomerDetail(1)],
  ["customers.loadClusterDistribution", () => customers.loadClusterDistribution()],
  ["customers.loadClusterCustomerList", () => customers.loadClusterCustomerList({})],
  ["customers.loadClusterCustomerListPage", () => customers.loadClusterCustomerListPage({}, 1)],
  ["customers.loadCsAgents", () => customers.loadCsAgents()],
  ["customers.loadPics", () => customers.loadPics()],
  ["customers.loadMembershipSummary", () => customers.loadMembershipSummary()],
  ["customers.loadCustomerProfileHistory", () => customers.loadCustomerProfileHistory(1)],
  ["customers.updateCustomerMembership", () => customers.updateCustomerMembership(1, { status: "GROUPED" })],
  ["customers.updateCustomerProfileAction", () => customers.updateCustomerProfileAction(1, { name: "A" })],
  ["customers.setCustomerArchivedAction", () => customers.setCustomerArchivedAction(1, true)],
  ["workspace.loadWorkspaceOverview", () => workspace.loadWorkspaceOverview()],
  ["workspace.loadAssignableCrmUsers", () => workspace.loadAssignableCrmUsers()],
  ["workspace.loadWorkspaceTaskList", () => workspace.loadWorkspaceTaskList({})],
  ["workspace.loadWorkspaceTaskListPage", () => workspace.loadWorkspaceTaskListPage({}, 1)],
  ["workspace.loadWorkspaceTaskDetail", () => workspace.loadWorkspaceTaskDetail(1)],
  ["workspace.loadCustomerTaskHistoryAction", () => workspace.loadCustomerTaskHistoryAction(1)],
  ["workspace.loadReportsForCustomerAction", () => workspace.loadReportsForCustomerAction(1)],
  ["workspace.cancelTaskAction", () => workspace.cancelTaskAction(1, "x")],
  ["workspace.createManualTasksBulkAction", () => workspace.createManualTasksBulkAction({ customerIds: [1], taskType: "BROADCAST" })],
  ["workspace.confirmJoinedGroupAction", () => workspace.confirmJoinedGroupAction(1, {})],
  // Workspace CRM V1 (fresh start) — Pesanan/Master Data (read)/Biaya Operasional/Overview.
  ["pesanan.loadWorkspacePesananListAction", () => pesanan.loadWorkspacePesananListAction({})],
  ["pesanan.loadWorkspacePesananKpiAction", () => pesanan.loadWorkspacePesananKpiAction({})],
  ["pesanan.loadWorkspacePesananDetailAction", () => pesanan.loadWorkspacePesananDetailAction(1)],
  ["pesanan.loadActiveCrmUsersAction", () => pesanan.loadActiveCrmUsersAction()],
  ["pesanan.createWorkspacePesananAction", () => pesanan.createWorkspacePesananAction(validOrderBody)],
  ["pesanan.updateWorkspacePesananAction", () => pesanan.updateWorkspacePesananAction(1, validOrderBody)],
  ["pesanan.confirmWorkspacePesananAction", () => pesanan.confirmWorkspacePesananAction(1)],
  ["pesanan.cancelWorkspacePesananAction", () => pesanan.cancelWorkspacePesananAction(1)],
  ["masterData.loadWorkspaceProductsAction", () => masterData.loadWorkspaceProductsAction({})],
  ["masterData.loadWorkspaceProductOptionsAction", () => masterData.loadWorkspaceProductOptionsAction()],
  ["masterData.loadWorkspaceProductAliasesAction", () => masterData.loadWorkspaceProductAliasesAction(1)],
  ["costs.loadWorkspaceCostsAction", () => costs.loadWorkspaceCostsAction({})],
  ["costs.loadWorkspaceCostAction", () => costs.loadWorkspaceCostAction(1)],
  ["costs.createWorkspaceCostAction", () => costs.createWorkspaceCostAction(validCostBody)],
  ["costs.updateWorkspaceCostDraftAction", () => costs.updateWorkspaceCostDraftAction(1, validCostBody)],
  ["costs.submitWorkspaceCostAction", () => costs.submitWorkspaceCostAction(1)],
  ["costs.leaderVerifyWorkspaceCostAction", () => costs.leaderVerifyWorkspaceCostAction(1)],
  ["costs.spvApproveWorkspaceCostAction", () => costs.spvApproveWorkspaceCostAction(1)],
  ["costs.directorApproveWorkspaceCostAction", () => costs.directorApproveWorkspaceCostAction(1)],
  ["costs.requestRevisionWorkspaceCostAction", () => costs.requestRevisionWorkspaceCostAction(1, { reason: "x" })],
  ["costs.rejectWorkspaceCostAction", () => costs.rejectWorkspaceCostAction(1, { reason: "x" })],
  ["costs.cancelWorkspaceCostAction", () => costs.cancelWorkspaceCostAction(1)],
  ["overview.loadWorkspaceOverviewAction", () => overview.loadWorkspaceOverviewAction({})],
  ["workspaceAudit.loadEntityAuditLogAction", () => workspaceAudit.loadEntityAuditLogAction({ entityType: "WORKSPACE_ORDER", entityId: 1 })],
  // Data Quality — produk tidak dikenal memuat nama customer contoh (PII).
  ["masterData.loadUnmappedProductsAction", () => masterData.loadUnmappedProductsAction()],
];

const ADMIN_ONLY_ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ["importAdmin.loadImportHistory", () => importAdmin.loadImportHistory(1)],
  ["importAdmin.loadDataQualityIssues", () => importAdmin.loadDataQualityIssues({})],
];

/** ADMIN-only juga, tapi lewat requireCrmPermission (src/lib/crm-permissions.ts)
 *  bukan requireRole langsung — pesan errornya "Permission X diperlukan", beda
 *  dari ADMIN_ONLY_ACTIONS di atas yang pakai requireRole ("Role tidak punya akses").
 *  Master Data harga jual/HPP sama sensitif dengan HPP mutation legacy (§11). */
const CRM_PERMISSION_ADMIN_ONLY_ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ["masterData.createWorkspaceProductAction", () => masterData.createWorkspaceProductAction(validProductBody)],
  ["masterData.updateWorkspaceProductAction", () => masterData.updateWorkspaceProductAction(1, validProductBody)],
  ["masterData.deactivateWorkspaceProductAction", () => masterData.deactivateWorkspaceProductAction(1, { reason: "Alasan uji" })],
  ["masterData.createWorkspaceProductAliasAction", () => masterData.createWorkspaceProductAliasAction({ productInternalId: 1, aliasName: "ALIAS" })],
  // Resolve/retry membuat workspace_order + alias -> sekelas mutation Master Data.
  ["masterData.resolveUnmappedProductAction", () => masterData.resolveUnmappedProductAction(1, 1)],
  ["masterData.retryUnmappedProductAction", () => masterData.retryUnmappedProductAction(1)],
  ["masterData.ignoreUnmappedProductAction", () => masterData.ignoreUnmappedProductAction(1, "alasan uji")],
];

const AGGREGATE_ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ["analytics.loadRetentionAnalytics", () => analytics.loadRetentionAnalytics()],
  ["analytics.loadFrequencyAnalytics", () => analytics.loadFrequencyAnalytics()],
  ["analytics.loadRfmAnalytics", () => analytics.loadRfmAnalytics()],
  ["analytics.loadDashboardSummary", () => analytics.loadDashboardSummary()],
];

/** Reconciliation = ADMIN + MANAGEMENT (src/lib/roles.ts). CRM ditolak.
 *  Kandidat memuat nama customer, jadi tetap tidak boleh terbuka untuk publik. */
const ADMIN_MANAGEMENT_ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ["reconciliation.loadReconciliationReport", () => reconciliation.loadReconciliationReport()],
  ["reconciliation.loadReconciliationCandidatesAction", () => reconciliation.loadReconciliationCandidatesAction()],
  ["reconciliation.reviewReconciliationAction", () => reconciliation.reviewReconciliationAction({ id: 1, decision: "RECONCILED", reason: "alasan uji" })],
];

const ALL_ACTIONS = [
  ...PII_ACTIONS,
  ...ADMIN_ONLY_ACTIONS,
  ...CRM_PERMISSION_ADMIN_ONLY_ACTIONS,
  ...AGGREGATE_ACTIONS,
  ...ADMIN_MANAGEMENT_ACTIONS,
];

beforeEach(() => {
  sessionMock.mockReset();
  activeMock.mockReset().mockResolvedValue(true);
});

describe("Server Action security — akun nonaktif langsung ditolak", () => {
  it("sesi valid tapi akun sudah dinonaktifkan -> ditolak", async () => {
    loginAs("ADMIN");
    activeMock.mockResolvedValue(false);
    await expect(customers.loadCustomerList({})).rejects.toThrow("Akun sudah dinonaktifkan");
  });
});

describe("Server Action security — MANAGEMENT tidak boleh membaca PII", () => {
  /** Pesan bisa berasal dari requireRole ("Role tidak punya akses") atau, untuk
   *  action domain CRM yang memakai matriks permission granular (src/lib/crm-permissions.ts),
   *  dari requireCrmPermission ("Permission X diperlukan") — keduanya sama-sama
   *  ForbiddenError (403); yang wajib benar adalah MANAGEMENT tetap ditolak. */
  it.each(PII_ACTIONS)("%s ditolak untuk MANAGEMENT", async (_name, call) => {
    loginAs("MANAGEMENT");
    await expect(call()).rejects.toThrow(/Role tidak punya akses|Permission .+ diperlukan/);
  });
});

describe("Server Action security — hanya ADMIN", () => {
  it.each(ADMIN_ONLY_ACTIONS)("%s ditolak untuk CRM", async (_name, call) => {
    loginAs("CRM");
    await expect(call()).rejects.toThrow("Role tidak punya akses");
  });

  it.each(ADMIN_ONLY_ACTIONS)("%s ditolak untuk MANAGEMENT", async (_name, call) => {
    loginAs("MANAGEMENT");
    await expect(call()).rejects.toThrow("Role tidak punya akses");
  });

  it.each(CRM_PERMISSION_ADMIN_ONLY_ACTIONS)("%s ditolak untuk CRM (permission diperlukan)", async (_name, call) => {
    loginAs("CRM");
    await expect(call()).rejects.toThrow(/Permission .+ diperlukan/);
  });

  it.each(CRM_PERMISSION_ADMIN_ONLY_ACTIONS)("%s ditolak untuk MANAGEMENT (permission diperlukan)", async (_name, call) => {
    loginAs("MANAGEMENT");
    await expect(call()).rejects.toThrow(/Permission .+ diperlukan/);
  });

  it.each(CRM_PERMISSION_ADMIN_ONLY_ACTIONS)("%s lolos guard untuk ADMIN", async (_name, call) => {
    loginAs("ADMIN");
    await expect(call()).rejects.not.toThrow(/Belum login|Role tidak punya akses|Permission .+ diperlukan/);
  });
});

describe("Server Action security — Reconciliation hanya ADMIN + MANAGEMENT", () => {
  it.each(ADMIN_MANAGEMENT_ACTIONS)("%s ditolak untuk CRM", async (_name, call) => {
    loginAs("CRM");
    await expect(call()).rejects.toThrow("Role tidak punya akses");
  });

  it.each(ADMIN_MANAGEMENT_ACTIONS)("%s lolos guard untuk ADMIN", async (_name, call) => {
    loginAs("ADMIN");
    await expect(call()).rejects.not.toThrow(/Belum login|Role tidak punya akses/);
  });

  it.each(ADMIN_MANAGEMENT_ACTIONS)("%s lolos guard untuk MANAGEMENT", async (_name, call) => {
    loginAs("MANAGEMENT");
    await expect(call()).rejects.not.toThrow(/Belum login|Role tidak punya akses/);
  });
});

describe("Server Action security — unauthenticated ditolak di SEMUA action", () => {
  it.each(ALL_ACTIONS)("%s ditolak tanpa sesi", async (_name, call) => {
    loggedOut();
    await expect(call()).rejects.toThrow("Belum login");
  });
});

describe("Server Action security — role yang berhak lolos guard", () => {
  /** Lolos guard = TIDAK melempar Unauthorized/Forbidden. Karena DB dimock,
   *  yang muncul adalah penanda DB_TOUCHED — itu justru bukti guard sudah lewat. */
  async function expectPassesGuard(call: () => Promise<unknown>) {
    await expect(call()).rejects.not.toThrow(/Belum login|Role tidak punya akses/);
  }

  it.each(PII_ACTIONS)("%s lolos untuk ADMIN", async (_name, call) => {
    loginAs("ADMIN");
    await expectPassesGuard(call);
  });

  it.each(PII_ACTIONS)("%s lolos untuk CRM", async (_name, call) => {
    loginAs("CRM");
    await expectPassesGuard(call);
  });

  it.each(AGGREGATE_ACTIONS)("%s lolos untuk MANAGEMENT (agregat, bukan PII)", async (_name, call) => {
    loginAs("MANAGEMENT");
    await expectPassesGuard(call);
  });
});

describe("Server Action security — parameter divalidasi Zod", () => {
  beforeEach(() => loginAs("ADMIN"));

  it("filter dengan key asing dibuang, tidak diteruskan ke SQL builder", () => {
    // Bukti: schema strip key tak dikenal, jadi tidak ada jalur ke pembangun SQL.
    const parsed = customerListFilterSchema.parse({ search: "budi", evil: "1=1" });
    expect(parsed).toEqual({ search: "budi" });
  });

  it("global search membatasi tipe dan panjang query sebelum menyentuh DB", async () => {
    await expect(customers.searchCustomersQuickAction(123)).rejects.toThrow();
    await expect(customers.searchCustomersQuickAction("x".repeat(201))).rejects.toThrow();
  });

  it("id non-numerik ditolak sebelum menyentuh DB", async () => {
    await expect(customers.loadCustomerDetail("abc")).rejects.toThrow();
    await expect(workspace.loadWorkspaceTaskDetail("../../etc/passwd")).rejects.toThrow();
  });

  it("enum di luar daftar ditolak", async () => {
    await expect(customers.loadCustomerList({ membershipStatus: "SUPERUSER" })).rejects.toThrow();
    await expect(workspace.loadWorkspaceTaskList({ status: "HACKED" })).rejects.toThrow();
  });

  it("tanggal berformat salah ditolak", async () => {
    await expect(customers.loadCustomerList({ orderDateFrom: "01-08-2026" })).rejects.toThrow();
    await expect(analytics.loadDashboardSummary({ dateFrom: "kemarin" })).rejects.toThrow();
  });

  it("perPage tidak bisa dinaikkan tanpa batas", async () => {
    await expect(customers.loadCustomerList({ perPage: 100000 })).rejects.toThrow();
  });

  it("confirmJoinedGroupAction memvalidasi input (regresi: dulu tanpa Zod)", async () => {
    await expect(workspace.confirmJoinedGroupAction(1, { joinedAt: "bukan-tanggal" })).rejects.toThrow();
  });
});

// diimpor di bawah supaya mock di atas sudah terpasang lebih dulu
const { customerListFilterSchema } = await import("@/lib/list-filter-contracts");
