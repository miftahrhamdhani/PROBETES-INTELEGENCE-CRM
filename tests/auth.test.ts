import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/next-path";
import { canAccessPath, rolesForPath, type UserRole } from "@/lib/roles";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("safeNextPath (anti open redirect)", () => {
  it("path internal diteruskan", () => {
    expect(safeNextPath("/cohort")).toBe("/cohort");
    expect(safeNextPath("/customers/6281234567890?tab=order")).toBe(
      "/customers/6281234567890?tab=order"
    );
  });

  it("tujuan eksternal dibuang", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});

describe("Password hashing", () => {
  it("hash != plaintext, verify cocok", async () => {
    const stored = await hashPassword("rahasia-panjang");
    expect(stored).not.toContain("rahasia-panjang");
    expect(stored.startsWith("scrypt:")).toBe(true);
    expect(await verifyPassword("rahasia-panjang", stored)).toBe(true);
  });

  it("salt acak: password sama -> hash beda", async () => {
    expect(await hashPassword("rahasia-panjang")).not.toBe(await hashPassword("rahasia-panjang"));
  });

  it("password salah / hash rusak -> false, tidak throw", async () => {
    const stored = await hashPassword("rahasia-panjang");
    expect(await verifyPassword("salah", stored)).toBe(false);
    expect(await verifyPassword("rahasia-panjang", "bcrypt:xx:yy")).toBe(false);
    expect(await verifyPassword("rahasia-panjang", "")).toBe(false);
    expect(await verifyPassword("rahasia-panjang", "scrypt:00:00")).toBe(false);
  });

  it("tolak password terlalu pendek", async () => {
    await expect(hashPassword("short")).rejects.toThrow("minimal 8 karakter");
  });
});

describe("RBAC (docs/05-UI.md §3)", () => {
  const matrix: Array<{ path: string; allowed: UserRole[] }> = [
    { path: "/", allowed: ["ADMIN", "CRM", "MANAGEMENT"] },
    { path: "/cohort", allowed: ["ADMIN", "CRM", "MANAGEMENT"] },
    { path: "/frequency", allowed: ["ADMIN", "CRM", "MANAGEMENT"] },
    { path: "/rfm", allowed: ["ADMIN", "CRM", "MANAGEMENT"] },
    { path: "/cluster", allowed: ["ADMIN", "CRM", "MANAGEMENT"] },
    { path: "/customers", allowed: ["ADMIN", "CRM"] },
    { path: "/groups", allowed: ["ADMIN", "CRM"] },
    { path: "/import", allowed: ["ADMIN"] },
    { path: "/mapping", allowed: ["ADMIN"] },
    { path: "/quality", allowed: ["ADMIN"] },
    { path: "/history", allowed: ["ADMIN"] },
    { path: "/rules", allowed: ["ADMIN", "MANAGEMENT"] },
    { path: "/users", allowed: ["ADMIN"] },
    { path: "/api/import/commit", allowed: ["ADMIN"] },
  ];

  it.each(matrix)("$path hanya untuk $allowed", ({ path, allowed }) => {
    for (const role of ["ADMIN", "CRM", "MANAGEMENT"] as UserRole[]) {
      expect(canAccessPath(role, path)).toBe(allowed.includes(role));
    }
  });

  it("tanpa role -> selalu ditolak", () => {
    expect(canAccessPath(undefined, "/")).toBe(false);
    expect(canAccessPath(undefined, "/cohort")).toBe(false);
  });

  it("sub-path mewarisi izin parent", () => {
    expect(canAccessPath("CRM", "/customers/6281234567890")).toBe(true);
    expect(canAccessPath("CRM", "/import/history")).toBe(false);
  });

  it("path tak dikenal ditolak semua role (default deny)", () => {
    expect(rolesForPath("/rahasia")).toBeNull();
    expect(canAccessPath("ADMIN", "/rahasia")).toBe(false);
  });
});
