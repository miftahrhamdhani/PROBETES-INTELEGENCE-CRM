/**
 * Group Membership — halaman HANYA berisi customer yang SUDAH masuk grup.
 *
 * Pola sama dengan test lain di repo ini: DB dimock, yang diuji adalah SQL yang
 * benar-benar dikirim + kontrak tipe. Verifikasi terhadap data sungguhan
 * dijalankan terpisah lewat script read-only dan dilaporkan di ringkasan.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GROUP_SOURCE_LABELS } from "@/lib/group-membership-types";
import { groupMembershipSource } from "@/server/db/schema";

const executed: string[] = [];
function renderSql(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(renderSql).join(" ");
  const record = node as Record<string, unknown>;
  if (typeof record.value === "string") return record.value;
  if (Array.isArray(record.value)) return record.value.map(renderSql).join(" ");
  if (Array.isArray(record.queryChunks)) return record.queryChunks.map(renderSql).join(" ");
  return "";
}
vi.mock("@/server/db/client", () => ({
  getDb: () => ({
    execute: async (query: unknown) => {
      executed.push(renderSql(query));
      return { rows: [] };
    },
  }),
}));

const q = await import("@/server/membership/queries");

beforeEach(() => {
  executed.length = 0;
});

describe("Halaman hanya menampilkan GROUPED", () => {
  it("listGroupMembers memfilter status = GROUPED", async () => {
    await q.listGroupMembers({ page: 1, perPage: 10 });
    expect(executed.length).toBeGreaterThan(0);
    for (const sqlText of executed) expect(sqlText).toContain("gm.status = 'GROUPED'");
  });

  it("tidak pernah menyebut NOT_GROUPED/UNKNOWN/CONFLICT di query daftar", async () => {
    await q.listGroupMembers({ page: 1, perPage: 10 });
    for (const sqlText of executed) {
      expect(sqlText).not.toContain("NOT_GROUPED");
      expect(sqlText).not.toContain("UNKNOWN");
      expect(sqlText).not.toContain("CONFLICT");
    }
  });

  it("KPI juga dipagari GROUPED", async () => {
    await q.getGroupMembershipKpi();
    expect(executed.some((s) => s.includes("gm.status = 'GROUPED'"))).toBe(true);
  });

  it("detail menolak customer yang tidak GROUPED", async () => {
    await q.getGroupMemberDetail(1);
    expect(executed[0]).toContain("gm.status = 'GROUPED'");
  });
});

describe("Filter benar-benar masuk SQL (server-side)", () => {
  it("search nama + nomor HP", async () => {
    await q.listGroupMembers({ search: "6281234567", page: 1, perPage: 10 });
    expect(executed[0]).toContain("c.name ILIKE");
    expect(executed[0]).toContain("c.normalized_phone LIKE");
  });

  it("cluster, grup, PIC", async () => {
    await q.listGroupMembers({ cluster: "A1", groupName: "Grup 01", pic: "Nayla", page: 1, perPage: 10 });
    expect(executed[0]).toContain("cc.cluster_code");
    expect(executed[0]).toContain("gm.group_name");
    expect(executed[0]).toContain("pic.name");
  });

  it("rentang tanggal memfilter joined_at (BUKAN tanggal order)", async () => {
    await q.listGroupMembers({ joinedFrom: "2026-08-01", joinedTo: "2026-08-31", page: 1, perPage: 10 });
    expect(executed[0]).toContain("gm.joined_at >=");
    expect(executed[0]).toContain("gm.joined_at <=");
    expect(executed[0]).not.toContain("o.order_date");
  });
});

describe("Tidak mengarang data", () => {
  const src = readFileSync(resolve(process.cwd(), "src/server/membership/queries.ts"), "utf8");

  it("Member Baru Bulan Ini hanya menghitung joined_at yang benar-benar terisi", () => {
    expect(src).toContain("gm.joined_at IS NOT NULL");
    // Tidak boleh diperkirakan dari history/created_at.
    expect(src).not.toMatch(/COALESCE\(gm\.joined_at/);
  });

  it("tidak menulis apa pun — hanya SELECT", () => {
    expect(src).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
  });

  it("cluster hanya DIBACA dari cluster engine existing", () => {
    expect(src).toContain("customer_cluster_current");
    expect(src).not.toMatch(/assignCluster|buildCustomerFeatures/);
  });
});

describe("Sumber Update", () => {
  it("enum punya GROUP_IMPORT untuk membedakan import dari manual", () => {
    expect(groupMembershipSource.enumValues).toContain("GROUP_IMPORT");
    expect(groupMembershipSource.enumValues).toContain("CRM_MANUAL");
  });

  it("label memetakan seluruh nilai enum", () => {
    for (const value of groupMembershipSource.enumValues) {
      expect(GROUP_SOURCE_LABELS[value]).toBeTruthy();
    }
    expect(GROUP_SOURCE_LABELS.GROUP_IMPORT).toBe("Import");
    expect(GROUP_SOURCE_LABELS.CRM_MANUAL).toBe("Manual");
  });
});

describe("SSOT sama dengan aksi manual Customers", () => {
  it("membaca tabel yang sama dengan updateMembership()", () => {
    const queries = readFileSync(resolve(process.cwd(), "src/server/membership/queries.ts"), "utf8");
    const service = readFileSync(resolve(process.cwd(), "src/server/membership/service.ts"), "utf8");
    expect(queries).toContain("customer_group_memberships");
    expect(service).toContain("customer_group_memberships");
  });

  it("edit/remove memakai service existing, bukan hard-delete", () => {
    const actions = readFileSync(resolve(process.cwd(), "src/app/group-membership-actions.ts"), "utf8");
    expect(actions).toContain("updateMembership({");
    expect(actions).toContain('status: "GROUPED"');
    expect(actions).toContain('status: "NOT_GROUPED"');
    expect(actions).not.toMatch(/DELETE FROM customers/i);
  });

  it("perubahan membership selalu merekalkulasi cluster", () => {
    const service = readFileSync(resolve(process.cwd(), "src/server/membership/service.ts"), "utf8");
    expect(service).toContain("recalculateClusterForCustomer(client, input.customerId)");
  });
});

describe("Pagination", () => {
  it("DataTable menerima offset nomor baris dari page server", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/groups/page.tsx"), "utf8");
    const table = readFileSync(resolve(process.cwd(), "src/components/data-table/data-table.tsx"), "utf8");
    expect(page).toContain("rowNumberOffset={(currentPage - 1) * list.perPage}");
    expect(table).toContain("rowNumberOffset + row.index + 1");
  });
});

describe("Aturan cluster", () => {
  it("tetap satu cluster FIRST MATCH WINS, bukan multi-cluster", () => {
    const engine = readFileSync(resolve(process.cwd(), "src/server/cluster/engine.ts"), "utf8");
    expect(engine).toContain("FIRST MATCH WINS");
    expect(engine).toContain("if (result) return result");
  });
});
