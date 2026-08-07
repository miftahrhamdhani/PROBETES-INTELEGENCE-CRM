"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCrmPermission } from "@/server/auth/guards";
import {
  workspaceProductAliasBodySchema,
  workspaceProductAliasUpdateSchema,
  workspaceProductBodySchema,
  workspaceProductBulkStatusSchema,
  workspaceProductCreateBodySchema,
  workspaceProductDeactivateSchema,
  workspaceProductFilterSchema,
} from "@/lib/workspace-master-data-contracts";
import {
  createWorkspaceProduct,
  createWorkspaceProductAlias,
  deactivateWorkspaceProduct,
  getWorkspaceProduct,
  getWorkspaceProductKpi,
  listWorkspaceProductAliases,
  listWorkspaceProductOptions,
  listWorkspaceProducts,
  listWorkspaceProductUsage,
  reactivateWorkspaceProduct,
  setWorkspaceProductsActive,
  updateWorkspaceProduct,
  updateWorkspaceProductAlias,
} from "@/server/workspace/products";
import { ignoreUnmappedProduct, listUnmappedProducts, resolveUnmappedProduct, retryUnmappedProduct } from "@/server/workspace/data-quality";
import { listEntityAuditLog } from "@/server/workspace/audit";
import { revalidateAnalytics } from "@/server/analytics/cache";

const productIdSchema = z.coerce.number().int().positive();
const usagePageSchema = z.object({
  productInternalId: productIdSchema,
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
});

function refreshProducts() {
  revalidatePath("/workspace/master-produk");
  revalidatePath("/workspace/pesanan");
}

export async function loadWorkspaceProductsAction(input: unknown) {
  await requireCrmPermission("crm.product.read");
  return listWorkspaceProducts(workspaceProductFilterSchema.parse(input ?? {}));
}

export async function loadWorkspaceProductKpiAction() {
  await requireCrmPermission("crm.product.read");
  return getWorkspaceProductKpi();
}

export async function loadWorkspaceProductAction(id: unknown) {
  await requireCrmPermission("crm.product.read");
  return getWorkspaceProduct(productIdSchema.parse(id));
}

export async function loadWorkspaceProductOptionsAction(itemType?: unknown) {
  await requireCrmPermission("crm.product.read");
  const parsed = z.enum(["SALE", "BONUS", "SAMPLE"]).optional().parse(itemType);
  return listWorkspaceProductOptions(parsed);
}

export async function loadWorkspaceProductAliasesAction(productInternalId: unknown) {
  await requireCrmPermission("crm.product.read");
  return listWorkspaceProductAliases(productIdSchema.parse(productInternalId));
}

export async function loadWorkspaceProductUsageAction(input: unknown) {
  await requireCrmPermission("crm.product.read");
  const body = usagePageSchema.parse(input);
  return listWorkspaceProductUsage(body.productInternalId, body.page, body.perPage);
}

export async function loadWorkspaceProductAuditAction(productInternalId: unknown) {
  await requireCrmPermission("crm.product.audit.read");
  return listEntityAuditLog("WORKSPACE_PRODUCT", productIdSchema.parse(productInternalId));
}

export async function createWorkspaceProductAction(input: unknown) {
  const user = await requireCrmPermission("crm.product.create");
  const id = await createWorkspaceProduct(workspaceProductCreateBodySchema.parse(input), Number(user.id));
  refreshProducts();
  return id;
}

export async function updateWorkspaceProductAction(id: unknown, input: unknown) {
  const user = await requireCrmPermission("crm.product.update");
  await updateWorkspaceProduct(productIdSchema.parse(id), workspaceProductBodySchema.parse(input), Number(user.id));
  refreshProducts();
}

export async function deactivateWorkspaceProductAction(id: unknown, input: unknown) {
  const user = await requireCrmPermission("crm.product.deactivate");
  const body = workspaceProductDeactivateSchema.parse(input);
  await deactivateWorkspaceProduct(productIdSchema.parse(id), Number(user.id), body.reason);
  refreshProducts();
}

export async function reactivateWorkspaceProductAction(id: unknown) {
  const user = await requireCrmPermission("crm.product.deactivate");
  await reactivateWorkspaceProduct(productIdSchema.parse(id), Number(user.id));
  refreshProducts();
}

export async function bulkSetWorkspaceProductsActiveAction(input: unknown) {
  const user = await requireCrmPermission("crm.product.deactivate");
  const body = workspaceProductBulkStatusSchema.parse(input);
  const updated = await setWorkspaceProductsActive(body.ids, body.active, Number(user.id), body.reason);
  refreshProducts();
  return { updated };
}

export async function createWorkspaceProductAliasAction(input: unknown) {
  const user = await requireCrmPermission("crm.product.alias.manage");
  const body = workspaceProductAliasBodySchema.parse(input);
  const id = await createWorkspaceProductAlias(
    body.productInternalId,
    body.aliasName,
    Number(user.id),
    body.sourceSystem,
    body.notes
  );
  refreshProducts();
  return id;
}

export async function updateWorkspaceProductAliasAction(id: unknown, input: unknown) {
  const user = await requireCrmPermission("crm.product.alias.manage");
  await updateWorkspaceProductAlias(productIdSchema.parse(id), workspaceProductAliasUpdateSchema.parse(input), Number(user.id));
  refreshProducts();
}

export async function loadUnmappedProductsAction(status?: unknown) {
  await requireCrmPermission("crm.product.read");
  const parsed = z.enum(["PENDING", "RESOLVED", "IGNORED"]).optional().parse(status);
  return listUnmappedProducts(parsed);
}

export async function resolveUnmappedProductAction(id: unknown, mappedProductInternalId: unknown) {
  const user = await requireCrmPermission("crm.product.alias.manage");
  const result = await resolveUnmappedProduct(productIdSchema.parse(id), productIdSchema.parse(mappedProductInternalId), Number(user.id));
  revalidateAnalytics();
  refreshProducts();
  return result;
}

export async function retryUnmappedProductAction(id: unknown) {
  const user = await requireCrmPermission("crm.product.alias.manage");
  const result = await retryUnmappedProduct(productIdSchema.parse(id), Number(user.id));
  revalidateAnalytics();
  return result;
}

export async function ignoreUnmappedProductAction(id: unknown, reason: unknown) {
  const user = await requireCrmPermission("crm.product.alias.manage");
  await ignoreUnmappedProduct(productIdSchema.parse(id), Number(user.id), z.string().trim().min(3).max(500).parse(reason));
}
