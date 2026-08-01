import { canAccessPath, type UserRole } from "@/lib/roles";
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

export async function requireSession(): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user?.role) throw new UnauthorizedError();
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
