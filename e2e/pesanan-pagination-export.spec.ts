import { expect, test } from "@playwright/test";
import { authStatePath } from "./credentials";

/**
 * Regresi audit performa/QA:
 *  - BUG-01: seluruh endpoint export Pesanan mengembalikan HTTP 400 (perPage
 *    export dilewatkan ke .parse() yang membatasi <= 200). Read-only, tidak
 *    membuat data apa pun.
 *  - BUG-02: halaman Pesanan hanya menampilkan 50 baris pertama tanpa kontrol
 *    pagination — baris berikutnya tidak bisa dijangkau operator sama sekali.
 */
test.use({ storageState: authStatePath("admin") });

const RANGE = "from=2020-01-01&to=2030-12-31";

test.describe("Pesanan — pagination & export", () => {
  test("export CSV memakai filter aktif dan tidak lagi gagal validasi", async ({ request }) => {
    const response = await request.get(`/api/workspace/pesanan/export.csv?${RANGE}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    const body = await response.text();
    expect(body).toContain("NomorPesanan");
  });

  test("export Excel tidak lagi gagal validasi", async ({ request }) => {
    const response = await request.get(`/api/workspace/pesanan/export.xlsx?${RANGE}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("spreadsheetml");
  });

  test("export tetap 200 walau dibuka dari halaman selain 1", async ({ request }) => {
    // Sebelum perbaikan, `page` ikut terkirim dan membuat offset export meleset.
    const response = await request.get(`/api/workspace/pesanan/export.csv?${RANGE}&page=3`);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("NomorPesanan");
  });

  test("export menolak permintaan tanpa sesi, bukan hanya menyembunyikan tombol", async ({ baseURL }) => {
    // `fetch` polos: tidak ada cookie sama sekali. Fixture `browser`/`request`
    // Playwright ikut membawa storageState dari test.use() di atas, jadi keduanya
    // TIDAK bisa dipakai untuk membuktikan perilaku anonim.
    // Export memuat PII (nama + No.HP penuh) — backend wajib menolak sendiri.
    const response = await fetch(`${baseURL}/api/workspace/pesanan/export.csv?${RANGE}`, { redirect: "manual" });
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("NomorPesanan");
  });

  test("role CRM memang berhak export (crm.order.export ada di CRM_MUTATIONS)", async ({ browser }) => {
    // Mengunci keputusan matriks permission yang berlaku, supaya perubahan
    // tak sengaja pada roleHasCrmPermission() ketahuan.
    const context = await browser.newContext({ storageState: authStatePath("crm") });
    const response = await context.request.get(`/api/workspace/pesanan/export.csv?${RANGE}`);
    expect(response.status()).toBe(200);
    await context.close();
  });

  test("kontrol pagination tampil dan page size dapat diganti lewat URL", async ({ page }) => {
    await page.goto(`/workspace/pesanan?${RANGE}`);

    await expect(page.getByRole("link", { name: "Berikutnya" }).or(page.getByText("Berikutnya"))).toBeVisible();
    await expect(page.getByText(/dari .* pesanan/)).toBeVisible();

    await page.goto(`/workspace/pesanan?${RANGE}&perPage=25`);
    await expect(page.getByRole("link", { name: "25", exact: true })).toHaveAttribute("aria-current", "true");
  });

  test("halaman di luar rentang tetap menampilkan total yang benar, bukan 0", async ({ page }) => {
    // Regresi: `COUNT(*) OVER()` ikut hilang saat rows kosong sehingga total
    // jadi 0 dan operator terjebak di halaman kosong tanpa jalan kembali.
    // Sekarang count dihitung query terpisah DAN nomor halaman di-clamp ke
    // halaman terakhir yang sah.
    await page.goto(`/workspace/pesanan?${RANGE}&page=999`);

    const summary = page.getByText(/dari .* pesanan/);
    await expect(summary).toBeVisible();
    await expect(summary).not.toHaveText(/dari 0 pesanan/);
    // Ter-clamp: indikator halaman tidak boleh menunjukkan 999.
    await expect(page.getByText(/^\d+ \/ \d+$/)).not.toHaveText(/^999 \//);
  });
});
