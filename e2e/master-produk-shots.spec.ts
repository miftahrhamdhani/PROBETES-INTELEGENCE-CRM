import { expect, test } from "@playwright/test";
import { authStatePath } from "./credentials";

test.use({ storageState: authStatePath("admin") });

for (const viewport of [
  { name: "desktop", width: 1600, height: 1000 },
  { name: "tablet", width: 1024, height: 1200 },
  { name: "mobile", width: 390, height: 1200 },
]) {
  test(`Master Produk ${viewport.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/workspace/master-produk");
    await expect(page.getByRole("heading", { name: "Master Produk" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/^\d+ produk terdaftar$/)).toBeVisible();
    await page.screenshot({ path: `artifacts/master-produk-${viewport.name}.png`, fullPage: true });
  });
}

test("route Master Data lama redirect", async ({ page }) => {
  await page.goto("/workspace/master-data?search=amandia");
  await page.waitForURL("**/workspace/master-produk?search=amandia");
  await expect(page.getByRole("heading", { name: "Master Produk" })).toBeVisible();
});
