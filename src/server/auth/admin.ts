/**
 * BACKEND — user management (halaman Users, ADMIN).
 *
 * Aturan keamanan yang dijaga di sini:
 *  - password_hash TIDAK PERNAH keluar dari modul ini (tidak ada di tipe row).
 *  - Tidak boleh terjadi lockout: admin aktif terakhir tidak bisa dinonaktifkan
 *    atau diturunkan role-nya. Dicek DI DALAM transaction, bukan cuma di UI.
 *  - Setiap perubahan menulis jejak ke user_history (append-only).
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withTransaction, type TransactionClient } from "@/server/db/transaction";
import { hashPassword } from "./password";
import { normalizeEmail } from "./users";
import type { UserAdminRow, UserHistoryEntry } from "@/lib/user-admin-contracts";
import type { UserRole } from "@/lib/roles";

export class UserAdminError extends Error {}

const ROW_SELECT = `
  SELECT u.id, u.email, u.name, u.role::text AS role, u.active,
         u.created_at::text AS created_at, u.updated_at::text AS updated_at,
         cb.name AS created_by, ub.name AS updated_by
  FROM users u
  LEFT JOIN users cb ON cb.id = u.created_by
  LEFT JOIN users ub ON ub.id = u.updated_by
`;

type UserRowDb = {
  id: number; email: string; name: string; role: UserRole; active: boolean;
  created_at: string; updated_at: string; created_by: string | null; updated_by: string | null;
};

function toRow(row: UserRowDb): UserAdminRow {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export async function listUsers(): Promise<UserAdminRow[]> {
  const result = await getDb().execute<UserRowDb>(sql.raw(`${ROW_SELECT} ORDER BY u.active DESC, u.name`));
  return result.rows.map(toRow);
}

export async function listUserHistory(userId: number): Promise<UserHistoryEntry[]> {
  const result = await getDb().execute<{
    id: number; action: string; detail: Record<string, unknown>; changed_by: string | null; changed_at: string;
  }>(sql`
    SELECT h.id, h.action, h.detail, u.name AS changed_by, h.changed_at::text
    FROM user_history h
    LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.user_id = ${userId}
    ORDER BY h.changed_at DESC, h.id DESC
    LIMIT 100
  `);
  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    detail: row.detail ?? {},
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  }));
}

async function writeHistory(
  client: TransactionClient,
  userId: number,
  action: string,
  detail: Record<string, unknown>,
  actorId: number
) {
  await client.query(
    "INSERT INTO user_history (user_id, action, detail, changed_by) VALUES ($1, $2, $3::jsonb, $4)",
    [userId, action, JSON.stringify(detail), actorId]
  );
}

/**
 * Jumlah ADMIN aktif SELAIN user tertentu. Dipakai untuk mencegah lockout:
 * kalau hasilnya 0, user itu adalah satu-satunya admin aktif yang tersisa.
 */
async function otherActiveAdmins(client: TransactionClient, excludeUserId: number): Promise<number> {
  const result = await client.query<{ total: string }>(
    "SELECT COUNT(*)::text AS total FROM users WHERE role = 'ADMIN' AND active = true AND id <> $1",
    [excludeUserId]
  );
  return Number(result.rows[0]?.total ?? 0);
}

export async function createUser(
  input: { email: string; name: string; role: UserRole; password: string },
  actorId: number
): Promise<UserAdminRow> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  return withTransaction(async (client) => {
    const existing = await client.query("SELECT 1 FROM users WHERE email = $1", [email]);
    if (existing.rows.length) throw new UserAdminError("Email sudah terdaftar");

    const inserted = await client.query<UserRowDb>(
      `INSERT INTO users (email, name, password_hash, role, active, created_by, updated_by)
       VALUES ($1, $2, $3, $4::user_role, true, $5, $5)
       RETURNING id, email, name, role::text AS role, active,
                 created_at::text AS created_at, updated_at::text AS updated_at,
                 NULL::text AS created_by, NULL::text AS updated_by`,
      [email, input.name, passwordHash, input.role, actorId]
    );
    const row = inserted.rows[0]!;
    await writeHistory(client, row.id, "CREATE", { email, name: input.name, role: input.role }, actorId);
    return toRow(row);
  });
}

export async function updateUser(
  userId: number,
  input: { name: string; role: UserRole },
  actorId: number
): Promise<void> {
  await withTransaction(async (client) => {
    const current = await client.query<{ name: string; role: UserRole; active: boolean }>(
      "SELECT name, role::text AS role, active FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );
    const before = current.rows[0];
    if (!before) throw new UserAdminError("User tidak ditemukan");

    // Menurunkan role admin aktif terakhir = lockout.
    if (before.role === "ADMIN" && input.role !== "ADMIN" && before.active) {
      if ((await otherActiveAdmins(client, userId)) === 0) {
        throw new UserAdminError("Tidak bisa mengubah role: ini satu-satunya ADMIN aktif yang tersisa");
      }
    }

    await client.query(
      "UPDATE users SET name = $2, role = $3::user_role, updated_by = $4, updated_at = now() WHERE id = $1",
      [userId, input.name, input.role, actorId]
    );

    if (before.name !== input.name) {
      await writeHistory(client, userId, "UPDATE_PROFILE", { from: before.name, to: input.name }, actorId);
    }
    if (before.role !== input.role) {
      await writeHistory(client, userId, "UPDATE_ROLE", { from: before.role, to: input.role }, actorId);
    }
  });
}

export async function setUserActive(userId: number, active: boolean, actorId: number): Promise<void> {
  await withTransaction(async (client) => {
    const current = await client.query<{ role: UserRole; active: boolean }>(
      "SELECT role::text AS role, active FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );
    const before = current.rows[0];
    if (!before) throw new UserAdminError("User tidak ditemukan");
    if (before.active === active) return;

    if (!active && before.role === "ADMIN" && (await otherActiveAdmins(client, userId)) === 0) {
      throw new UserAdminError("Tidak bisa menonaktifkan: ini satu-satunya ADMIN aktif yang tersisa");
    }

    await client.query(
      "UPDATE users SET active = $2, updated_by = $3, updated_at = now() WHERE id = $1",
      [userId, active, actorId]
    );
    await writeHistory(client, userId, active ? "ACTIVATE" : "DEACTIVATE", {}, actorId);
  });
}

/**
 * Reset password oleh admin. Password baru hanya di-hash lalu disimpan —
 * TIDAK dikembalikan, TIDAK dicatat ke history, TIDAK ditulis ke log.
 */
export async function resetUserPassword(userId: number, newPassword: string, actorId: number): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (client) => {
    const exists = await client.query("SELECT 1 FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (!exists.rows.length) throw new UserAdminError("User tidak ditemukan");
    await client.query(
      "UPDATE users SET password_hash = $2, updated_by = $3, updated_at = now() WHERE id = $1",
      [userId, passwordHash, actorId]
    );
    await writeHistory(client, userId, "RESET_PASSWORD", {}, actorId);
  });
}

/** Dipakai guard sesi: akun yang dinonaktifkan harus langsung kehilangan akses,
 *  tidak menunggu JWT kedaluwarsa. */
export async function isUserActive(userId: number): Promise<boolean> {
  const result = await getDb().execute<{ active: boolean }>(sql`
    SELECT active FROM users WHERE id = ${userId}
  `);
  return result.rows[0]?.active === true;
}
