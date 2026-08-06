import { test, expect, type Page } from "@playwright/test";
import { authStatePath } from "./credentials";

test.use({ storageState: authStatePath("crm") });

// Samakan dengan todayInJakarta() yang dipakai form (bukan UTC) — mencegah
// mismatch tanggal saat test berjalan pada jam dini hari UTC.
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const TEST_PHONE = `0812${String(Date.now()).slice(-8)}`;
const TEST_CUSTOMER = `E2E TEST ${Date.now()}`;
const UNIT_PRICE = 54_000; // PRD-0002 Amandia Muesli

async function kpiValue(page: Page, label: string): Promise<string> {
  const value = await page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]").innerText();
  return value.trim();
}

test.describe("Siklus Pesanan — create, confirm, cancel, KPI, filter tanggal", () => {
  test("order dibuat lalu dikonfirmasi; CANCELLED langsung hilang dari KPI; filter tanggal konsisten Overview/Pesanan", async ({ page }) => {
    // 1) Buat pesanan baru sebagai DRAFT.
    await page.goto("/workspace/pesanan/baru");
    const customerField = page.locator(".space-y-1").filter({ has: page.getByText("Nama Konsumen", { exact: false }) });
    await customerField.locator("input").fill(TEST_CUSTOMER);
    const phoneField = page.locator(".space-y-1").filter({ has: page.getByText("Nomor HP", { exact: false }) });
    await phoneField.locator("input").fill(TEST_PHONE);

    const productTrigger = page.getByRole("button", { name: "Pilih produk" }).first();
    await productTrigger.click();
    await page.getByPlaceholder("Cari...").fill("Amandia Muesli");
    await page.getByRole("button", { name: /PRD-0002.*Amandia Muesli/ }).click();

    await page.getByRole("button", { name: "Simpan" }).click();
    await page.waitForURL("**/workspace/pesanan");

    // 2) Buka detail order yang baru dibuat, konfirmasi.
    await page.getByText(TEST_CUSTOMER).first().click();
    await expect(page.getByRole("heading", { name: /PSN-/ }).or(page.getByText("PSN-"))).toBeVisible();
    await page.getByRole("button", { name: "Konfirmasi" }).click();
    await expect(page.getByRole("dialog").getByText("CONFIRMED")).toBeVisible();

    // 3) KPI Pesanan untuk tanggal ini HARUS mencakup order (Total Sales >= harga satuan produk).
    await page.goto(`/workspace/pesanan?from=${TODAY}&to=${TODAY}`);
    const totalSalesPesananConfirmed = Number((await kpiValue(page, "Total Sales")).replace(/\D/g, ""));
    expect(totalSalesPesananConfirmed).toBeGreaterThanOrEqual(UNIT_PRICE);

    // 4) Konsistensi filter tanggal: Overview pada tanggal yang sama menunjukkan Total Sales yang SAMA
    //    (kedua halaman membaca workspace_orders/workspace_order_items dengan kontrak from/to identik,
    //    tanpa filter customer/CRM tambahan).
    await page.goto(`/workspace/overview?from=${TODAY}&to=${TODAY}`);
    const totalSalesOverview = (await kpiValue(page, "Total Sales")).replace(/\D/g, "");
    await page.goto(`/workspace/pesanan?from=${TODAY}&to=${TODAY}`);
    const totalSalesPesanan = (await kpiValue(page, "Total Sales")).replace(/\D/g, "");
    expect(totalSalesOverview).toBe(totalSalesPesanan);

    // 5) Batalkan order lagi (cleanup) dan verifikasi Total Sales TURUN kembali —
    //    membuktikan CANCELLED tidak masuk KPI. Ini juga membersihkan data test dari
    //    Neon dev (order tetap ada untuk audit tapi tidak lagi memengaruhi angka apa pun).
    await page.goto("/workspace/pesanan");
    await page.getByText(TEST_CUSTOMER).first().click();
    await page.getByRole("button", { name: "Batalkan", exact: true }).click();
    await page.getByRole("button", { name: "Batalkan Pesanan" }).click();
    await expect(page.getByRole("dialog").getByText("CANCELLED")).toBeVisible();

    await page.goto(`/workspace/pesanan?from=${TODAY}&to=${TODAY}`);
    const totalSalesAfterCancel = Number((await kpiValue(page, "Total Sales")).replace(/\D/g, ""));
    expect(totalSalesAfterCancel).toBe(totalSalesPesananConfirmed - UNIT_PRICE);
  });
});
