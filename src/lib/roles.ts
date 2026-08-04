/**
 * SHARED — RBAC murni (tanpa I/O, tanpa React). Dipakai middleware (edge),
 * guard server, dan filter menu sidebar agar satu sumber kebenaran.
 * Matriks visibilitas: docs/05-UI.md §3.
 */
export const USER_ROLES = ["ADMIN", "CRM", "MANAGEMENT"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const LOGIN_PATH = "/login";

/** Route -> role yang boleh mengakses. Path diurut dari yang paling spesifik. */
const ROUTE_ACCESS: ReadonlyArray<{ prefix: string; roles: readonly UserRole[] }> = [
  { prefix: "/cohort", roles: ["ADMIN", "CRM", "MANAGEMENT"] },
  { prefix: "/frequency", roles: ["ADMIN", "CRM", "MANAGEMENT"] },
  { prefix: "/rfm", roles: ["ADMIN", "CRM", "MANAGEMENT"] },
  { prefix: "/cluster", roles: ["ADMIN", "CRM", "MANAGEMENT"] },
  { prefix: "/customers", roles: ["ADMIN", "CRM"] },
  { prefix: "/groups", roles: ["ADMIN", "CRM"] },
  { prefix: "/workspace", roles: ["ADMIN", "CRM"] },
  { prefix: "/import", roles: ["ADMIN"] },
  { prefix: "/mapping", roles: ["ADMIN"] },
  { prefix: "/quality", roles: ["ADMIN"] },
  { prefix: "/history", roles: ["ADMIN"] },
  { prefix: "/reconciliation", roles: ["ADMIN", "MANAGEMENT"] },
  { prefix: "/rules", roles: ["ADMIN", "MANAGEMENT"] },
  { prefix: "/users", roles: ["ADMIN"] },
  { prefix: "/api/import", roles: ["ADMIN"] },
  /** Export daftar broadcast (FR-24) — sama dengan hak akses /customers. */
  { prefix: "/api/customers", roles: ["ADMIN", "CRM"] },
  { prefix: "/api/crm-reports", roles: ["ADMIN", "CRM"] },
];

/** Dashboard: semua role. */
const ROOT_ROLES: readonly UserRole[] = ["ADMIN", "CRM", "MANAGEMENT"];

/** Role yang diizinkan untuk sebuah path. `null` = path tidak dikenal (default tolak). */
export function rolesForPath(pathname: string): readonly UserRole[] | null {
  if (pathname === "/") return ROOT_ROLES;
  const match = ROUTE_ACCESS.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)
  );
  return match ? match.roles : null;
}

export function canAccessPath(role: UserRole | undefined, pathname: string): boolean {
  if (!role) return false;
  const roles = rolesForPath(pathname);
  return roles ? roles.includes(role) : false;
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}
