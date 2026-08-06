import { z } from "zod";
import type { WorkspaceProductUsage } from "./workspace-product-seed";

export const WORKSPACE_PRODUCT_USAGES = ["SELLABLE", "BONUS_ONLY", "SELLABLE_AND_BONUS", "INACTIVE"] as const;

export const workspaceProductBodySchema = z
  .object({
    productName: z.string().trim().min(1, "Nama produk wajib diisi").max(200),
    sellingPrice: z.coerce.number().int().min(0).nullable(),
    unitHpp: z.coerce.number().int().min(0),
    productUsage: z.enum(WORKSPACE_PRODUCT_USAGES),
    description: z.string().trim().max(500).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if ((value.productUsage === "SELLABLE" || value.productUsage === "SELLABLE_AND_BONUS") && value.sellingPrice == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sellingPrice"], message: "Produk SELLABLE wajib mempunyai harga jual" });
    }
  });

export type WorkspaceProductBody = z.infer<typeof workspaceProductBodySchema>;

export const workspaceProductAliasBodySchema = z.object({
  productInternalId: z.coerce.number().int().positive(),
  aliasName: z.string().trim().min(1, "Nama alias wajib diisi").max(200),
});
export type WorkspaceProductAliasBody = z.infer<typeof workspaceProductAliasBodySchema>;

export const workspaceProductFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  productUsage: z.enum(WORKSPACE_PRODUCT_USAGES).optional(),
  includeInactive: z.coerce.boolean().default(true),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50),
});
export type WorkspaceProductFilter = z.infer<typeof workspaceProductFilterSchema>;

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
};

export type WorkspaceProductAliasRow = {
  id: number;
  productId: number;
  sourceSystem: string;
  aliasName: string;
  aliasNormalized: string;
  isActive: boolean;
  createdAt: string;
  createdByName: string | null;
};

/** Produk yang boleh dipilih sebagai item_type tertentu pada form Pesanan —
 *  hanya produk aktif, sesuai gating docs prompt §6.3.3. */
export type WorkspaceProductOption = {
  id: number;
  productId: string;
  productName: string;
  sellingPrice: string | null;
  unitHpp: string;
  productUsage: WorkspaceProductUsage;
};
