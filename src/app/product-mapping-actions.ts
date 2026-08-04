"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/guards";
import {
  approveMappingSchema,
  unknownProductFilterSchema,
} from "@/lib/product-mapping-types";
import {
  approveProductMapping,
  listApprovedAliases,
  listCanonicalProducts,
  listUnknownProducts,
  previewMappingImpact,
} from "@/server/product/service";
import { revalidateAnalytics } from "@/server/analytics/cache";

/** Product Mapping = ADMIN saja (src/lib/roles.ts /mapping). */
const requireMappingAccess = () => requireRole("ADMIN");

export async function loadUnknownProducts(filter: unknown) {
  await requireMappingAccess();
  return listUnknownProducts(unknownProductFilterSchema.parse(filter ?? {}));
}

export async function loadCanonicalProducts() {
  await requireMappingAccess();
  return listCanonicalProducts();
}

export async function loadApprovedAliases() {
  await requireMappingAccess();
  return listApprovedAliases();
}

/** Dampak sebelum aksi — admin harus melihat angka nyata dulu, tidak menebak. */
export async function previewMappingImpactAction(input: unknown) {
  await requireMappingAccess();
  const body = approveMappingSchema.parse(input);
  return previewMappingImpact(body.rawProductName, body.productId);
}

export async function approveProductMappingAction(input: unknown) {
  const user = await requireMappingAccess();
  const body = approveMappingSchema.parse(input);
  const result = await approveProductMapping({
    rawProductName: body.rawProductName,
    productId: body.productId,
    userId: Number(user.id),
  });
  // Mapping mengubah product_id item -> cluster & data quality ikut berubah.
  // Dibatalkan SETELAH tulis berhasil.
  revalidateAnalytics();
  revalidatePath("/mapping");
  revalidatePath("/cluster");
  return result;
}
