import { cache } from "react";
import { canAccessPath, type UserRole } from "@/lib/roles";
import { isUserActive } from "./admin";
import { auth } from "./index";

export class UnauthorizedError extends Error {
  constructor(message = "Belum login") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Role tidak punya akses") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type SessionUser = { id: string; email: string; name: string; role: UserRole };

/**
 * Sesi memakai JWT (maxAge 12 jam), jadi menonaktifkan user di halaman Users
 * TIDAK otomatis mencabut token yang sudah terlanjur terbit. Karena itu status
 * `active` diperiksa ke DB di sini.
 *
 * Dibungkus React `cache()` — memoization per-request, bukan render: satu
 * request yang memanggil beberapa Server Action hanya menghasilkan SATU query.
 * Ini satu-satunya tempat src/server boleh menyentuh `react` (lihat pengecualian
 * di eslint.config.mjs); tidak ada JSX dan tetap bisa diuji tanpa render.
 */
const activeCheck = cache(async (userId: number) => isUserActive(userId));

export async function requireSession(): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user?.role) throw new UnauthorizedError();

  const id = Number(user.id);
  if (Number.isInteger(id) && id > 0 && !(await activeCheck(id))) {
    throw new UnauthorizedError("Akun sudah dinonaktifkan");
  }

  return {
    id: user.id ?? "",
    email: user.email ?? "",
    name: user.name ?? "",
    role: user.role,
  };
}

/** Guard untuk route handler: lempar ForbiddenError kalau role tidak diizinkan. */
export async function requireRole(...allowed: UserRole[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!allowed.includes(user.role)) throw new ForbiddenError();
  return user;
}

/** Guard berbasis path, memakai matriks yang sama dengan middleware & sidebar. */
export async function requirePathAccess(pathname: string): Promise<SessionUser> {
  const user = await requireSession();
  if (!canAccessPath(user.role, pathname)) throw new ForbiddenError();
  return user;
}

export function authErrorStatus(error: unknown): number | null {
  if (error instanceof UnauthorizedError) return 401;
  if (error instanceof ForbiddenError) return 403;
  return null;
}
