"use server";

import { z } from "zod";
import { requireCrmPermission } from "@/server/auth/guards";
import {
  workspaceProductAliasBodySchema,
  workspaceProductBodySchema,
  workspaceProductFilterSchema,
} from "@/lib/workspace-master-data-contracts";
import {
  createWorkspaceProduct,
  createWorkspaceProductAlias,
  deactivateWorkspaceProduct,
  listWorkspaceProductAliases,
  listWorkspaceProductOptions,
  listWorkspaceProducts,
  updateWorkspaceProduct,
} from "@/server/workspace/products";
import { ignoreUnmappedProduct, listUnmappedProducts, resolveUnmappedProduct, retryUnmappedProduct } from "@/server/workspace/data-quality";
import { revalidateAnalytics } from "@/server/analytics/cache";

export async function loadWorkspaceProductsAction(input: unknown) {
  await requireCrmPermission("crm.product.read");
  return listWorkspaceProducts(workspaceProductFilterSchema.parse(input ?? {}));
}

export async function loadWorkspaceProductOptionsAction(itemType?: unknown) {
  await requireCrmPermission("crm.product.read");
  const parsed = z.enum(["SALE", "BONUS", "SAMPLE"]).optional().parse(itemType);
  return listWorkspaceProductOptions(parsed);
}

export async function loadWorkspaceProductAliasesAction(productInternalId: number) {
  await requireCrmPermission("crm.product.read");
  return listWorkspaceProductAliases(z.coerce.number().int().positive().parse(productInternalId));
}

export async function createWorkspaceProductAction(input: unknown) {
  const user = await requireCrmPermission("crm.product.create");
  const body = workspaceProductBodySchema.parse(input);
  return createWorkspaceProduct(body, Number(user.id));
}

export async function updateWorkspaceProductAction(id: number, input: unknown) {
  const user = await requireCrmPermission("crm.product.update");
  const body = workspaceProductBodySchema.parse(input);
  await updateWorkspaceProduct(z.coerce.number().int().positive().parse(id), body, Number(user.id));
}

export async function deactivateWorkspaceProductAction(id: number) {
  const user = await requireCrmPermission("crm.product.deactivate");
  await deactivateWorkspaceProduct(z.coerce.number().int().positive().parse(id), Number(user.id));
}

export async function createWorkspaceProductAliasAction(input: unknown) {
  const user = await requireCrmPermission("crm.product.update");
  const body = workspaceProductAliasBodySchema.parse(input);
  return createWorkspaceProductAlias(body.productInternalId, body.aliasName, Number(user.id));
}

export async function loadUnmappedProductsAction(status?: unknown) {
  await requireCrmPermission("crm.product.read");
  const parsed = z.enum(["PENDING", "RESOLVED", "IGNORED"]).optional().parse(status);
  return listUnmappedProducts(parsed);
}

/** Simpan alias + retry order terdampak dalam satu transaksi (§K). */
export async function resolveUnmappedProductAction(id: unknown, mappedProductInternalId: unknown) {
  const user = await requireCrmPermission("crm.product.update");
  const result = await resolveUnmappedProduct(
    z.coerce.number().int().positive().parse(id),
    z.coerce.number().int().positive().parse(mappedProductInternalId),
    Number(user.id)
  );
  revalidateAnalytics();
  return result;
}

/** Retry ulang tanpa mengubah mapping — untuk order yang dulu tertahan produk lain. */
export async function retryUnmappedProductAction(id: unknown) {
  const user = await requireCrmPermission("crm.product.update");
  const result = await retryUnmappedProduct(z.coerce.number().int().positive().parse(id), Number(user.id));
  revalidateAnalytics();
  return result;
}

export async function ignoreUnmappedProductAction(id: unknown, reason: unknown) {
  const user = await requireCrmPermission("crm.product.update");
  await ignoreUnmappedProduct(z.coerce.number().int().positive().parse(id), Number(user.id), z.string().trim().min(3).max(500).parse(reason));
}
