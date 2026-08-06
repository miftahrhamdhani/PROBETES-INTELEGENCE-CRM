import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Kredensial fixture E2E — dibaca dari file lokal gitignored yang dihasilkan
 * sekali oleh maintainer (lihat e2e/README.md). TIDAK PERNAH di-hardcode di
 * sini supaya tidak ada password yang tercatat di source/git history.
 */
export type Role = "admin" | "leader" | "spv" | "direktur" | "crm";

export const ROLE_EMAIL: Record<Role, string> = {
  admin: "e2e-admin@probetes.local",
  leader: "feny.nuraini@probetes.local",
  spv: "nimah.luthfianingsih@probetes.local",
  direktur: "rahman.ariefdewantara@probetes.local",
  crm: "sarah.rahma@probetes.local",
};

export function loadCredentials(): Record<string, string> {
  const filePath = path.resolve(process.cwd(), "e2e.credentials.local.json");
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error(
      `${filePath} tidak ditemukan. Jalankan bootstrap kredensial E2E terlebih dahulu (lihat e2e/README.md) — file ini gitignored dan tidak dibuat otomatis oleh CI.`
    );
  }
}

export function authStatePath(role: Role): string {
  return path.resolve(process.cwd(), "e2e", ".auth", `${role}.json`);
}
