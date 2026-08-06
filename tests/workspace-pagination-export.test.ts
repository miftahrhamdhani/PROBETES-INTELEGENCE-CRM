import { describe, expect, it } from "vitest";
import { WORKSPACE_EXPORT_MAX_ROWS } from "@/lib/list-chunk";
import { workspaceOrderFilterSchema } from "@/lib/workspace-pesanan-contracts";
import { workspaceCostFilterSchema } from "@/lib/workspace-cost-contracts";
import { workspaceProductFilterSchema } from "@/lib/workspace-master-data-contracts";

/**
 * Regresi BUG-01: seluruh endpoint export Pesanan/Orders mengembalikan HTTP 400.
 *
 * Penyebabnya `perPage: WORKSPACE_EXPORT_MAX_ROWS` dilewatkan KE DALAM
 * `.parse()`, sedangkan skema membatasi perPage <= 200 untuk melindungi input
 * URL. Test ini mengunci kedua sisi kontraknya: batas skema tetap ada, DAN
 * angka export tidak boleh dipakai lewat parse.
 */
describe("kontrak filter export workspace", () => {
  const exportSchemas = [["workspaceOrderFilterSchema", workspaceOrderFilterSchema]] as const;

  it("angka export melebihi batas perPage skema — wajib ditimpa SETELAH parse", () => {
    for (const [name, schema] of exportSchemas) {
      const parsed = schema.safeParse({ perPage: WORKSPACE_EXPORT_MAX_ROWS });
      expect(parsed.success, `${name} seharusnya menolak perPage export lewat parse`).toBe(false);
    }
  });

  it("pola yang dipakai route export menghasilkan filter valid", () => {
    for (const [name, schema] of exportSchemas) {
      const filter = { ...schema.parse({}), page: 1, perPage: WORKSPACE_EXPORT_MAX_ROWS };
      expect(filter.perPage, name).toBe(WORKSPACE_EXPORT_MAX_ROWS);
      // page selalu 1: export meliputi seluruh hasil filter, bukan halaman aktif.
      expect(filter.page, name).toBe(1);
    }
  });

  it("export tidak boleh ikut offset halaman yang sedang dibuka", () => {
    const onPageThree = workspaceOrderFilterSchema.parse({ page: "3" });
    expect(onPageThree.page).toBe(3);
    const exportFilter = { ...onPageThree, page: 1, perPage: WORKSPACE_EXPORT_MAX_ROWS };
    expect(exportFilter.page).toBe(1);
  });
});

/** Regresi: setiap tabel besar wajib punya default page size yang terbatas. */
describe("default pagination tabel workspace", () => {
  it("Pesanan default 50 baris", () => {
    const filter = workspaceOrderFilterSchema.parse({});
    expect(filter.page).toBe(1);
    expect(filter.perPage).toBe(50);
  });

  it("Biaya Operasional default 50 baris", () => {
    const filter = workspaceCostFilterSchema.parse({});
    expect(filter.page).toBe(1);
    expect(filter.perPage).toBe(50);
  });

  it("Master Data default 50 baris (sebelumnya tanpa LIMIT sama sekali)", () => {
    const filter = workspaceProductFilterSchema.parse({});
    expect(filter.page).toBe(1);
    expect(filter.perPage).toBe(50);
  });

  it("page size yang boleh dipilih user tetap dibatasi", () => {
    expect(workspaceOrderFilterSchema.safeParse({ perPage: 1000 }).success).toBe(false);
    expect(workspaceCostFilterSchema.safeParse({ perPage: 1000 }).success).toBe(false);
    expect(workspaceProductFilterSchema.safeParse({ perPage: 1000 }).success).toBe(false);
  });

  it("page size 25/50/100 yang ditawarkan UI semuanya diterima", () => {
    for (const size of [25, 50, 100]) {
      expect(workspaceOrderFilterSchema.safeParse({ perPage: size }).success, `perPage=${size}`).toBe(true);
    }
  });
});
