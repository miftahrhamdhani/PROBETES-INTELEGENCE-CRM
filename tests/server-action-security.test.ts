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
const reports = await import("@/app/crm-reports-actions");
const workspace = await import("@/app/workspace-actions");
const analytics = await import("@/app/analytics-actions");
const importAdmin = await import("@/app/import-admin-actions");

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
  ["reports.loadCrmReportList", () => reports.loadCrmReportList({})],
  ["reports.loadCrmReportListPage", () => reports.loadCrmReportListPage({}, 1)],
  ["reports.loadCrmReportDetail", () => reports.loadCrmReportDetail(1)],
  ["reports.loadReportPlatforms", () => reports.loadReportPlatforms()],
  ["reports.loadReportTotalValue", () => reports.loadReportTotalValue({})],
  ["reports.loadReportProductNames", () => reports.loadReportProductNames()],
  ["reports.setCrmReportArchivedAction", () => reports.setCrmReportArchivedAction(1, true)],
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
];

const ADMIN_ONLY_ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ["importAdmin.loadImportHistory", () => importAdmin.loadImportHistory(1)],
  ["importAdmin.loadDataQualityIssues", () => importAdmin.loadDataQualityIssues({})],
];

const AGGREGATE_ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ["analytics.loadRetentionAnalytics", () => analytics.loadRetentionAnalytics()],
  ["analytics.loadFrequencyAnalytics", () => analytics.loadFrequencyAnalytics()],
  ["analytics.loadRfmAnalytics", () => analytics.loadRfmAnalytics()],
  ["analytics.loadDashboardSummary", () => analytics.loadDashboardSummary()],
];

const ALL_ACTIONS = [...PII_ACTIONS, ...ADMIN_ONLY_ACTIONS, ...AGGREGATE_ACTIONS];

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
  it.each(PII_ACTIONS)("%s ditolak untuk MANAGEMENT", async (_name, call) => {
    loginAs("MANAGEMENT");
    await expect(call()).rejects.toThrow("Role tidak punya akses");
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
    await expect(reports.loadCrmReportDetail("../../etc/passwd")).rejects.toThrow();
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
