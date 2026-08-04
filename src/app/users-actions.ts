"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/guards";
import {
  createUser,
  listUserHistory,
  listUsers,
  resetUserPassword,
  setUserActive,
  updateUser,
} from "@/server/auth/admin";
import {
  createUserSchema,
  resetPasswordSchema,
  setUserActiveSchema,
  updateUserSchema,
} from "@/lib/user-admin-contracts";
import { idSchema } from "@/lib/list-filter-contracts";

/** Users = ADMIN saja (src/lib/roles.ts /users). */
const requireUserAdmin = () => requireRole("ADMIN");

export async function loadUsers() {
  await requireUserAdmin();
  return listUsers();
}

export async function loadUserHistory(userId: unknown) {
  await requireUserAdmin();
  return listUserHistory(idSchema.parse(userId));
}

export async function createUserAction(input: unknown) {
  const actor = await requireUserAdmin();
  const body = createUserSchema.parse(input);
  const row = await createUser(body, Number(actor.id));
  revalidatePath("/users");
  return row;
}

export async function updateUserAction(userId: unknown, input: unknown) {
  const actor = await requireUserAdmin();
  const id = idSchema.parse(userId);
  const body = updateUserSchema.parse(input);
  await updateUser(id, body, Number(actor.id));
  revalidatePath("/users");
}

export async function setUserActiveAction(userId: unknown, input: unknown) {
  const actor = await requireUserAdmin();
  const id = idSchema.parse(userId);
  const body = setUserActiveSchema.parse(input);
  await setUserActive(id, body.active, Number(actor.id));
  revalidatePath("/users");
}

/**
 * Reset password. Password baru dikirim sekali dari form dan langsung di-hash;
 * tidak pernah dikembalikan ke client, tidak pernah masuk history/log.
 */
export async function resetUserPasswordAction(userId: unknown, input: unknown) {
  const actor = await requireUserAdmin();
  const id = idSchema.parse(userId);
  const body = resetPasswordSchema.parse(input);
  await resetUserPassword(id, body.password, Number(actor.id));
  revalidatePath("/users");
}
