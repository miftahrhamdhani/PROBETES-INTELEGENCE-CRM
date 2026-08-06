import { expect, test } from "@playwright/test";
import { authStatePath } from "./credentials";

/**
 * Regresi audit menyeluruh (bukan hanya Workspace):
 *  - setiap route aktif dapat dibuka dan tidak error;
 *  - membuang filter di Customers/Group Membership TIDAK memicu full page
 *    reload (dulu memakai <a> biasa);
 *  - Reconciliation punya jalur review kandidat.
 *
 * Read-only: tidak membuat/mengubah data apa pun.
 */
test.use({ storageState: authStatePath("admin") });

const ROUTES: [string, RegExp][] = [
  ["/", /Dashboard|Overview|Customer/i],
  ["/cohort", /Cohort/i],
  ["/frequency", /Frequency/i],
  ["/rfm", /RFM/i],
  ["/cluster", /Cluster/i],
  ["/customers", /customer/i],
  ["/groups", /Group Membership/i],
  ["/import", /Import/i],
  ["/mapping", /Mapping|Product/i],
  ["/quality", /Data Quality|Issue|Quality/i],
  ["/history", /Import History|batch/i],
  ["/reconciliation", /Reconciliation|Rekonsiliasi/i],
  ["/rules", /Cluster Rules|Rules/i],
  ["/users", /User/i],
  ["/workspace/overview", /Overview/i],
  ["/workspace/pesanan", /Pesanan/i],
  ["/workspace/pembagian-tugas", /Pembagian Tugas|task/i],
  ["/workspace/master-data", /Master Data/i],
  ["/workspace/biaya-operasional", /Biaya Operasional/i],
];

test("seluruh route aktif dapat dibuka tanpa error", async ({ page }) => {
  test.setTimeout(180_000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`${page.url()}: ${error.message}`));

  for (const [route, expected] of ROUTES) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} status`).toBeLessThan(400);
    await expect(page.locator("body"), `${route} konten`).toContainText(expected, { timeout: 15_000 });
  }

  expect(failures, `error runtime saat membuka route:\n${failures.join("\n")}`).toEqual([]);
});

test("membuang filter di Customers tidak memicu full page reload", async ({ page }) => {
  await page.goto("/customers?cluster=A1");

  // Tandai dokumen: kalau terjadi full reload, penanda ini hilang.
  await page.evaluate(() => {
    (window as unknown as { __spaMarker?: boolean }).__spaMarker = true;
  });

  await page.getByText(/Cluster:/).first().click();
  await page.waitForURL((url) => !url.searchParams.has("cluster"), { timeout: 15_000 });

  const survived = await page.evaluate(() => (window as unknown as { __spaMarker?: boolean }).__spaMarker === true);
  expect(survived, "filter badge memicu full page reload — seharusnya navigasi client").toBe(true);
});

test("membuang filter di Group Membership tidak memicu full page reload", async ({ page }) => {
  await page.goto("/groups?membershipStatus=GROUPED");
  await page.evaluate(() => {
    (window as unknown as { __spaMarker?: boolean }).__spaMarker = true;
  });

  await page.getByText(/Status Grup:/).first().click();
  await page.waitForURL((url) => !url.searchParams.has("membershipStatus"), { timeout: 15_000 });

  const survived = await page.evaluate(() => (window as unknown as { __spaMarker?: boolean }).__spaMarker === true);
  expect(survived).toBe(true);
});

test("Reconciliation menampilkan jalur review kandidat", async ({ page }) => {
  await page.goto("/reconciliation");
  await expect(page.getByText("Kandidat pencocokan manual ↔ official")).toBeVisible();
  // Dengan antrean kosong, empty state wajib eksplisit — bukan panel kosong.
  await expect(
    page.getByText("Tidak ada kandidat menunggu keputusan.").or(page.getByRole("button", { name: "Cocokkan" }).first())
  ).toBeVisible({ timeout: 15_000 });
});

test("Reconciliation ditolak untuk role CRM", async ({ browser }) => {
  const context = await browser.newContext({ storageState: authStatePath("crm") });
  const page = await context.newPage();
  const response = await page.goto("/reconciliation");
  // Middleware memantulkan role tanpa akses ke dashboard.
  expect(page.url()).not.toContain("/reconciliation");
  expect(response?.status()).toBeLessThan(400);
  await context.close();
});
