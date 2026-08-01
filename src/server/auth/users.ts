import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import type { UserRole } from "@/lib/roles";
import { hashPassword } from "./password";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  passwordHash: string;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  const row = rows[0];
  return row ? (row as AuthUser) : null;
}

/** Upsert by email — dipakai `npm run db:seed:admin`, idempoten. */
export async function upsertUser(input: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}) {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const [row] = await getDb()
    .insert(users)
    .values({ email, name: input.name, passwordHash, role: input.role, active: true })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: input.name, passwordHash, role: input.role, active: true, updatedAt: new Date() },
    })
    .returning({ id: users.id, email: users.email, role: users.role });
  return row;
}
