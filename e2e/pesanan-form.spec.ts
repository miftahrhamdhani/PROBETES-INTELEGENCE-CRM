import { test, expect, type Locator, type Page } from "@playwright/test";
import { authStatePath } from "./credentials";

test.use({ storageState: authStatePath("crm") });

/** Field {label}<input/select> tidak memakai htmlFor/id (lihat Field() di
 *  pesanan-form.tsx), jadi dicari lewat wrapper ".space-y-1" yang mengandung
 *  label. Non-exact karena label wajib diisi tampil sebagai "{label} *". */
function fieldByLabel(page: Page, label: string): Locator {
  return page.locator(".space-y-1").filter({ has: page.getByText(label, { exact: false }) });
}

/** Baris Ringkasan Perhitungan — di-scope ke panel itu karena beberapa label
 *  (mis. "Admin COD") juga dipakai sebagai Field label form di panel lain. */
function summaryRow(page: Page, label: string): Locator {
  const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Ringkasan Perhitungan" }) });
  return panel.getByText(label, { exact: true }).locator("xpath=..");
}

/** Baris item produk (SALE atau BONUS/SAMPLE) berdasarkan urutan — tidak
 *  bergantung pada teks tombol Combobox yang berubah setelah produk dipilih.
 *  Di-scope ke panel Detail Produk supaya tidak ikut mencocokkan elemen
 *  "grid items-center" lain di header/sidebar layout. */
function itemRow(page: Page, index: number): Locator {
  const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Detail Produk" }) });
  return panel.locator("div.grid.items-center").nth(index);
}

test.describe("Form Pesanan — produk, bonus, COD, TOTAL real-time", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/workspace/pesanan/baru");
    await expect(page.getByText("Data Konsumen")).toBeVisible();
  });

  test("product combobox membaca Master Data (workspace_products)", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Pilih produk" }).first();
    await trigger.click();
    await page.getByPlaceholder("Cari...").fill("Amandia Muesli");
    await expect(page.getByRole("button", { name: /PRD-0002.*Amandia Muesli/ })).toBeVisible();
  });

  test("PRD-0025 (Pro Herbal Dummy) tidak dapat dipilih sebagai SALE", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Pilih produk" }).first();
    await trigger.click();
    await page.getByPlaceholder("Cari...").fill("Pro Herbal Dummy");
    await expect(page.getByText("Tidak ditemukan.")).toBeVisible();
  });

  test("PRD-0025 dapat dipilih sebagai BONUS, harga Rp0, HPP masuk COS", async ({ page }) => {
    await page.getByRole("button", { name: "Tambah Bonus/Sampel" }).click();
    const bonusRow = itemRow(page, 1);
    await bonusRow.locator("button").first().click();
    await page.getByPlaceholder("Cari...").fill("Pro Herbal Dummy");
    await page.getByRole("button", { name: /PRD-0025.*Pro Herbal Dummy/ }).click();
    await expect(bonusRow.locator("button").first()).toContainText("PRD-0025");

    // Nilai bonus row = Rp 0 (kolom "Nilai" pada baris item ini).
    await expect(bonusRow).toContainText("Rp 0");

    // HPP bonus (1 x Rp14.000) masuk COS Bonus/Sampel di Ringkasan Perhitungan.
    await expect(summaryRow(page, "COS Bonus/Sampel")).toContainText("Rp 14.000");
  });

  test("Admin COD otomatis Rp0 saat Transfer, terbuka dan tercatat saat COD", async ({ page }) => {
    const codField = fieldByLabel(page, "Admin COD");
    const codInput = codField.locator("input");
    await expect(codInput).toBeDisabled();
    await expect(codInput).toHaveValue("0");
    await expect(summaryRow(page, "Admin COD")).toContainText("Rp 0");

    await fieldByLabel(page, "Pembayaran").locator("select").selectOption("COD");
    await expect(codInput).toBeEnabled();
    await codInput.fill("5000");
    await expect(summaryRow(page, "Admin COD")).toContainText("Rp 5.000");

    await fieldByLabel(page, "Pembayaran").locator("select").selectOption("TRANSFER");
    await expect(codInput).toBeDisabled();
    await expect(codInput).toHaveValue("0");
    await expect(summaryRow(page, "Admin COD")).toContainText("Rp 0");
  });

  test("TOTAL berubah real-time ketika QTY produk berubah", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Pilih produk" }).first();
    await trigger.click();
    await page.getByPlaceholder("Cari...").fill("Amandia Muesli");
    await page.getByRole("button", { name: /PRD-0002.*Amandia Muesli/ }).click();

    const totalRow = summaryRow(page, "TOTAL");
    await expect(totalRow).toContainText("Rp 54.000");

    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill("2");
    await expect(totalRow).toContainText("Rp 108.000");
  });
});
