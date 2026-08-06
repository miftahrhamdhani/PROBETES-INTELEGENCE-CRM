import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { withTransaction } from "@/server/db/transaction";
import type { UserRole } from "@/lib/roles";
import { hashPassword, verifyPassword } from "./password";

export class InvalidCurrentPasswordError extends Error {}

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  passwordHash: string;
  mustChangePassword: boolean;
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

/** Upsert by email — dipakai `npm run db:seed:admin` untuk buat/reset akun
 *  tertentu secara eksplisit (password baru selalu diterapkan, termasuk ke
 *  user yang sudah ada — itu tujuan perintahnya). `mustChangePassword`
 *  default false supaya perilaku db:seed:admin existing tidak berubah. */
export async function upsertUser(input: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  mustChangePassword?: boolean;
}) {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const mustChangePassword = input.mustChangePassword ?? false;
  const [row] = await getDb()
    .insert(users)
    .values({ email, name: input.name, passwordHash, role: input.role, active: true, mustChangePassword })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: input.name, passwordHash, role: input.role, active: true, mustChangePassword, updatedAt: new Date() },
    })
    .returning({ id: users.id, email: users.email, role: users.role });
  return row;
}

/** Sinkron nama/role TANPA menyentuh password — dipakai bootstrap seed
 *  (mis. seed-crm-team.ts) supaya re-run tidak pernah menimpa password user
 *  yang sudah pernah login dan menggantinya sendiri. */
export async function syncUserProfile(email: string, input: { name: string; role: UserRole }): Promise<AuthUser | null> {
  const normalized = normalizeEmail(email);
  const [row] = await getDb()
    .update(users)
    .set({ name: input.name, role: input.role, active: true, updatedAt: new Date() })
    .where(eq(users.email, normalized))
    .returning();
  return row ? (row as AuthUser) : null;
}

/** Ganti password sendiri — wajib tahu password lama, melepas mustChangePassword.
 *  Dipakai halaman /change-password (docs prompt perbaikan §7). */
export async function changeOwnPassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
  await withTransaction(async (client) => {
    const existing = await client.query<{ id: number; password_hash: string }>(
      "SELECT id, password_hash FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );
    const row = existing.rows[0];
    if (!row) throw new Error("User tidak ditemukan");
    const ok = await verifyPassword(currentPassword, row.password_hash);
    if (!ok) throw new InvalidCurrentPasswordError("Password lama tidak cocok");

    const passwordHash = await hashPassword(newPassword);
    await client.query("UPDATE users SET password_hash = $2, must_change_password = false, updated_at = now() WHERE id = $1", [userId, passwordHash]);
    await client.query(
      "INSERT INTO user_history (user_id, action, detail, changed_by) VALUES ($1, 'RESET_PASSWORD', $2::jsonb, $1)",
      [userId, JSON.stringify({ self: true })]
    );
  });
}
