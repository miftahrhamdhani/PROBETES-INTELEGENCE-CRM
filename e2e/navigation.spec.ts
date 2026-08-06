import { test, expect } from "@playwright/test";
import { authStatePath } from "./credentials";

test.use({ storageState: authStatePath("admin") });

test.describe("Navigasi Workspace", () => {
  test("Overview dapat dibuka", async ({ page }) => {
    await page.goto("/workspace/overview");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText("Jumlah Customer").first()).toBeVisible();
  });

  test("Pesanan dapat dibuka", async ({ page }) => {
    await page.goto("/workspace/pesanan");
    await expect(page.getByRole("heading", { name: "Pesanan" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Input Pesanan" })).toBeVisible();
  });

  test("menu Performa Tim tidak ditemukan di sidebar", async ({ page }) => {
    await page.goto("/workspace/overview");
    await expect(page.getByRole("link", { name: /Performa Tim/i })).toHaveCount(0);
    await expect(page.getByText("Performa Tim")).toHaveCount(0);
  });

  test("route Performa Tim menghasilkan 404, bukan halaman aktif", async ({ page }) => {
    const response = await page.goto("/workspace/performa-tim");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Performa Tim")).toHaveCount(0);
  });
});
