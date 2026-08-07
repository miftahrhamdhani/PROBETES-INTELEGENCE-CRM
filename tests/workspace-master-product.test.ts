import { describe, expect, it } from "vitest";
import { NAV_TREE } from "@/components/layout/nav-tree";
import { roleHasCrmPermission } from "@/lib/crm-permissions";
import {
  workspaceProductCreateBodySchema,
  workspaceProductFilterSchema,
  WORKSPACE_PRODUCT_PAGE_SIZES,
} from "@/lib/workspace-master-data-contracts";
import { escapeProductCsvCell, toWorkspaceProductExportRows } from "@/server/workspace/products-export";

const validProduct = {
  productId: "PRO-0099",
  productName: "Produk Uji",
  sellingPrice: 100_000,
  unitHpp: 50_000,
  productUsage: "SELLABLE" as const,
  isActive: true,
};

describe("Master Produk — navigasi", () => {
  it("sidebar memakai label dan route baru", () => {
    const workspace = NAV_TREE.find((node) => node.kind === "category" && node.id === "workspace");
    expect(workspace?.kind).toBe("category");
    if (workspace?.kind !== "category") return;
    expect(workspace.items).toContainEqual(expect.objectContaining({ label: "Master Produk", href: "/workspace/master-produk" }));
    expect(workspace.items).not.toContainEqual(expect.objectContaining({ href: "/workspace/master-data" }));
  });
});

describe("Master Produk — filter, sorting, pagination", () => {
  it("menerima search Product ID/nama/alias melalui kontrak server yang sama", () => {
    expect(workspaceProductFilterSchema.parse({ search: "PRO-0001" }).search).toBe("PRO-0001");
    expect(workspaceProductFilterSchema.parse({ search: "Amandia" }).search).toBe("Amandia");
    expect(workspaceProductFilterSchema.parse({ search: "alias lama" }).search).toBe("alias lama");
  });

  it("menerima filter jenis, status, sorting, dan advanced", () => {
    const value = workspaceProductFilterSchema.parse({
      productUsage: "SELLABLE_AND_BONUS",
      status: "ACTIVE",
      sort: "usage_count",
      order: "desc",
      alias: "HAS_ALIAS",
      used: "USED",
      minPrice: "1000",
      maxPrice: "2000",
    });
    expect(value).toMatchObject({ productUsage: "SELLABLE_AND_BONUS", status: "ACTIVE", sort: "usage_count", order: "desc", alias: "HAS_ALIAS", used: "USED", minPrice: 1000, maxPrice: 2000 });
  });

  it("default 10 baris; hanya ukuran UI diterima", () => {
    expect(workspaceProductFilterSchema.parse({}).perPage).toBe(10);
    expect(WORKSPACE_PRODUCT_PAGE_SIZES).toEqual([10, 25, 50, 100]);
    expect(workspaceProductFilterSchema.safeParse({ perPage: 11 }).success).toBe(false);
  });
});

describe("Master Produk — validasi form", () => {
  it("produk valid berhasil dan Product ID dinormalisasi uppercase", () => {
    const result = workspaceProductCreateBodySchema.parse({ ...validProduct, productId: "pro-0099" });
    expect(result.productId).toBe("PRO-0099");
  });

  it("BONUS_ONLY boleh harga kosong atau Rp0", () => {
    expect(workspaceProductCreateBodySchema.safeParse({ ...validProduct, productUsage: "BONUS_ONLY", sellingPrice: null }).success).toBe(true);
    expect(workspaceProductCreateBodySchema.safeParse({ ...validProduct, productUsage: "BONUS_ONLY", sellingPrice: 0 }).success).toBe(true);
  });

  it("SELLABLE wajib harga jual", () => {
    expect(workspaceProductCreateBodySchema.safeParse({ ...validProduct, sellingPrice: null }).success).toBe(false);
  });

  it("INACTIVE tidak dapat dipilih dari form; status lewat aksi nonaktifkan", () => {
    expect(workspaceProductCreateBodySchema.safeParse({ ...validProduct, productUsage: "INACTIVE" }).success).toBe(false);
  });
});

describe("Master Produk — export dan permission", () => {
  it("Product ID tetap string; harga/HPP angka", () => {
    const [row] = toWorkspaceProductExportRows([{
      id: 1,
      productId: "PRO-0001",
      productName: "Amandia",
      sellingPrice: "75000",
      unitHpp: "33750",
      productUsage: "SELLABLE_AND_BONUS",
      description: null,
      isActive: true,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
      createdByName: null,
      updatedByName: null,
      aliasCount: 0,
      usageCount: 2,
    }]);
    expect(row?.ProductID).toBe("PRO-0001");
    expect(row?.HargaJual).toBe(75000);
    expect(row?.HPP).toBe(33750);
  });

  it("CSV injection dinetralkan", () => {
    expect(escapeProductCsvCell("=CMD()" )).toBe("'=CMD()");
    expect(escapeProductCsvCell("@SUM(A1)" )).toBe("'@SUM(A1)");
  });

  it("permission mutasi/export/alias/audit ADMIN-only; read tetap CRM", () => {
    expect(roleHasCrmPermission("CRM", "crm.product.read")).toBe(true);
    expect(roleHasCrmPermission("CRM", "crm.product.export")).toBe(false);
    expect(roleHasCrmPermission("CRM", "crm.product.alias.manage")).toBe(false);
    expect(roleHasCrmPermission("ADMIN", "crm.product.export")).toBe(true);
    expect(roleHasCrmPermission("ADMIN", "crm.product.audit.read")).toBe(true);
  });
});
