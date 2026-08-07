import { expect, test } from "@playwright/test";
import { authStatePath } from "./credentials";

test.use({ storageState: authStatePath("admin") });

for (const viewport of [
  { name: "desktop", width: 1600, height: 1000 },
  { name: "tablet", width: 1024, height: 1200 },
  { name: "mobile", width: 390, height: 1200 },
]) {
  test(`Biaya Operasional ${viewport.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/workspace/biaya-operasional");
    await expect(page.getByRole("heading", { name: "Biaya Operasional" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/^\d+ biaya ditemukan$/)).toBeVisible();
    await page.screenshot({ path: `artifacts/biaya-operasional-${viewport.name}.png`, fullPage: true });
  });
}

test("halaman tidak menampilkan kartu KPI", async ({ page }) => {
  await page.goto("/workspace/biaya-operasional");
  await expect(page.getByRole("heading", { name: "Biaya Operasional" })).toBeVisible();
  await expect(page.getByText("Total COM Approved")).toHaveCount(0);
  await expect(page.getByText("Menunggu Persetujuan")).toHaveCount(0);
});
