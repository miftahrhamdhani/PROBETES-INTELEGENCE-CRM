import { z } from "zod";
import type { WorkspaceProductUsage } from "./workspace-product-seed";

export const WORKSPACE_PRODUCT_USAGES = ["SELLABLE", "BONUS_ONLY", "SELLABLE_AND_BONUS", "INACTIVE"] as const;
export const EDITABLE_WORKSPACE_PRODUCT_USAGES = ["SELLABLE", "BONUS_ONLY", "SELLABLE_AND_BONUS"] as const;
export const WORKSPACE_PRODUCT_SORTS = [
  "product_id",
  "product_name",
  "selling_price",
  "unit_hpp",
  "product_usage",
  "status",
  "alias_count",
  "usage_count",
  "updated_at",
] as const;
export const WORKSPACE_PRODUCT_PAGE_SIZES = [10, 25, 50, 100] as const;

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();
const optionalMoney = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()
);
const optionalLegacyBoolean = z
  .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
  .optional();

const productFieldsSchema = z
  .object({
    productName: z.string().trim().min(1, "Nama produk wajib diisi").max(200),
    sellingPrice: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    unitHpp: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    productUsage: z.enum(EDITABLE_WORKSPACE_PRODUCT_USAGES),
    description: z.string().trim().max(500).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if ((value.productUsage === "SELLABLE" || value.productUsage === "SELLABLE_AND_BONUS") && value.sellingPrice == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sellingPrice"], message: "Produk sellable wajib mempunyai harga jual" });
    }
  });

export const workspaceProductBodySchema = productFieldsSchema;
export const workspaceProductCreateBodySchema = z.intersection(
  z.object({
    productId: z
      .string()
      .trim()
      .toUpperCase()
      .min(1, "Product ID wajib diisi")
      .max(40)
      .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, "Product ID hanya boleh berisi huruf, angka, dan tanda hubung"),
  }),
  productFieldsSchema
);

export type WorkspaceProductBody = z.infer<typeof workspaceProductBodySchema>;
export type WorkspaceProductCreateBody = z.infer<typeof workspaceProductCreateBodySchema>;

export const workspaceProductAliasBodySchema = z.object({
  productInternalId: z.coerce.number().int().positive(),
  aliasName: z.string().trim().min(1, "Nama alias wajib diisi").max(200),
  sourceSystem: z.string().trim().min(1).max(100).default("DATABASE_ALL"),
  notes: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().default(true),
});
export const workspaceProductAliasUpdateSchema = workspaceProductAliasBodySchema.omit({ productInternalId: true });
export type WorkspaceProductAliasBody = z.infer<typeof workspaceProductAliasBodySchema>;
export type WorkspaceProductAliasUpdate = z.infer<typeof workspaceProductAliasUpdateSchema>;

export const workspaceProductDeactivateSchema = z.object({
  reason: z.string().trim().min(3, "Alasan penonaktifan wajib diisi").max(500),
});

export const workspaceProductBulkStatusSchema = z
  .object({
    ids: z.array(z.coerce.number().int().positive()).min(1).max(500),
    active: z.boolean(),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.active && (!value.reason || value.reason.length < 3)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Alasan penonaktifan wajib diisi" });
    }
  });

export const workspaceProductFilterSchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    productUsage: z.enum(WORKSPACE_PRODUCT_USAGES).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    includeInactive: optionalLegacyBoolean,
    minPrice: optionalMoney,
    maxPrice: optionalMoney,
    minHpp: optionalMoney,
    maxHpp: optionalMoney,
    alias: z.enum(["HAS_ALIAS", "NO_ALIAS"]).optional(),
    used: z.enum(["USED", "UNUSED"]).optional(),
    createdFrom: optionalDate,
    createdTo: optionalDate,
    updatedFrom: optionalDate,
    updatedTo: optionalDate,
    sort: z.enum(WORKSPACE_PRODUCT_SORTS).default("product_id"),
    order: z.enum(["asc", "desc"]).default("asc"),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce
      .number()
      .int()
      .refine((value) => WORKSPACE_PRODUCT_PAGE_SIZES.includes(value as (typeof WORKSPACE_PRODUCT_PAGE_SIZES)[number]), "Ukuran halaman tidak valid")
      .default(10),
  })
  .superRefine((value, ctx) => {
    if (value.minPrice != null && value.maxPrice != null && value.minPrice > value.maxPrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxPrice"], message: "Harga maksimum harus lebih besar dari harga minimum" });
    }
    if (value.minHpp != null && value.maxHpp != null && value.minHpp > value.maxHpp) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxHpp"], message: "HPP maksimum harus lebih besar dari HPP minimum" });
    }
  });
export type WorkspaceProductFilter = z.infer<typeof workspaceProductFilterSchema>;

export type WorkspaceProductKpi = {
  total: number;
  active: number;
  inactive: number;
  sellable: number;
  bonus: number;
};

export type WorkspaceProductRow = {
  id: number;
  productId: string;
  productName: string;
  sellingPrice: string | null;
  unitHpp: string;
  productUsage: WorkspaceProductUsage;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
  aliasCount: number;
  usageCount: number;
};

export type WorkspaceProductAliasRow = {
  id: number;
  productId: number;
  sourceSystem: string;
  aliasName: string;
  aliasNormalized: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  createdByName: string | null;
};

export type WorkspaceProductUsageRow = {
  orderId: number;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  itemType: "SALE" | "BONUS" | "SAMPLE";
  quantity: string;
  sellingPriceSnapshot: string;
  unitHppSnapshot: string;
};

export type WorkspaceProductOption = {
  id: number;
  productId: string;
  productName: string;
  sellingPrice: string | null;
  unitHpp: string;
  productUsage: WorkspaceProductUsage;
};
