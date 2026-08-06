"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireCrmPermission } from "@/server/auth/guards";
import { createProductHpp, listProductHppHistory } from "@/server/product/hpp";

const createHppSchema = z.object({
  productId: z.coerce.number().int().positive(),
  unitHpp: z.coerce.number().int().min(0),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function loadProductHppHistoryAction(productId: unknown) {
  await requireCrmPermission("crm.hpp.create");
  return listProductHppHistory(z.coerce.number().int().positive().parse(productId));
}

export async function createProductHppAction(input: unknown) {
  const user = await requireCrmPermission("crm.hpp.create");
  const body = createHppSchema.parse(input);
  const result = await createProductHpp({ productId: body.productId, unitHpp: BigInt(body.unitHpp), effectiveFrom: body.effectiveFrom }, Number(user.id));
  revalidatePath("/mapping");
  return result;
}
