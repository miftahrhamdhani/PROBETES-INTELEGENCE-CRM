import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import { authStatePath, loadCredentials, ROLE_EMAIL, type Role } from "./credentials";

/** Login sekali per role, simpan storageState — dipakai semua spec lewat test.use(). */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  const credentials = loadCredentials();
  mkdirSync(path.resolve(process.cwd(), "e2e", ".auth"), { recursive: true });

  const browser = await chromium.launch();
  for (const role of Object.keys(ROLE_EMAIL) as Role[]) {
    const email = ROLE_EMAIL[role];
    const password = credentials[email];
    if (!password) throw new Error(`Password untuk ${email} tidak ada di e2e.credentials.local.json`);

    const page = await browser.newPage({ baseURL });
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Masuk" }).click();
    // Next dev cold-compile bisa lambat di navigasi pertama — beri margin besar.
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
    await page.context().storageState({ path: authStatePath(role) });
    await page.close();
  }
  await browser.close();
}
