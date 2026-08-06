import { expect, test, type ConsoleMessage } from "@playwright/test";
import { authStatePath } from "./credentials";

// Default untuk seluruh test di file ini. Dua test yang butuh `javaScriptEnabled:
// false` membuat context sendiri (dengan storageState yang sama) dan mengabaikan
// default ini — tidak ada konflik.
test.use({ storageState: authStatePath("admin") });

/**
 * Regresi: kategori sidebar yang berisi route aktif harus SUDAH terbuka pada
 * HTML pertama dari server — bukan tertutup lalu di-buka lewat useEffect
 * setelah hidrasi (§C audit implementasi final).
 *
 * Test "raw HTML" mematikan JavaScript sepenuhnya (`javaScriptEnabled: false`)
 * supaya yang diperiksa murni output SSR, tanpa kemungkinan React/framer-motion
 * ikut menutupi bug lewat efek client yang berjalan sebelum assertion sempat
 * membaca DOM.
 */
test.describe("Sidebar SSR — kategori aktif terbuka sejak HTML pertama", () => {
  test("nested route (Pesanan): link anak terlihat di HTML tanpa JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ storageState: authStatePath("admin"), javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/workspace/pesanan");

    // Tanpa JS, kalau panelnya masih tertutup (menunggu useEffect), link anak
    // ini tidak akan pernah ada di DOM sama sekali — beda dari "ada tapi
    // disembunyikan CSS", yang justru tidak bisa terjadi tanpa JS untuk
    // menutupnya (server merender apa adanya).
    const pesananLink = page.getByRole("link", { name: "Pesanan", exact: true });
    await expect(pesananLink).toBeVisible();
    await expect(pesananLink).toHaveAttribute("aria-current", "page");

    // Item lain dalam kategori yang sama (Workspace) turut terlihat, bukan
    // hanya item aktifnya — bukti panelnya benar-benar expanded, bukan
    // kebetulan satu link muncul di luar struktur kategori.
    await expect(page.getByRole("link", { name: "Master Data", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Biaya Operasional", exact: true })).toBeVisible();

    await context.close();
  });

  test("direct load ke route bersarang lain (Master Data) tetap terbuka", async ({ browser }) => {
    const context = await browser.newContext({ storageState: authStatePath("admin"), javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/workspace/master-data");
    await expect(page.getByRole("link", { name: "Master Data", exact: true })).toHaveAttribute("aria-current", "page");
    await context.close();
  });

  test("refresh browser mempertahankan kategori aktif terbuka", async ({ page }) => {
    await page.goto("/workspace/biaya-operasional");
    await expect(page.getByRole("link", { name: "Biaya Operasional", exact: true })).toHaveAttribute("aria-current", "page");
    await page.reload();
    await expect(page.getByRole("link", { name: "Biaya Operasional", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("tidak ada peringatan hydration mismatch di console", async ({ page }) => {
    const hydrationWarnings: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      const text = msg.text();
      if (/hydration|did not match|Text content does not match/i.test(text)) hydrationWarnings.push(text);
    });

    for (const route of ["/workspace/pesanan", "/workspace/master-data", "/customers", "/cluster"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
    }

    expect(hydrationWarnings, `hydration warning ditemukan:\n${hydrationWarnings.join("\n")}`).toEqual([]);
  });

  test("preferensi kategori lain di localStorage tetap dipulihkan setelah hydration", async ({ page }) => {
    await page.goto("/workspace/overview");
    // Tunggu network settle (hidrasi ikut selesai di titik ini) sebelum klik —
    // tanpa ini klik bisa jatuh di jendela sebelum React memasang event
    // handler-nya, membuat test ini sendiri flaky karena race hidrasi,
    // bukan karena bug di aplikasi (dikonfirmasi lolos konsisten begitu
    // interaktivitas ditunggu terlebih dahulu).
    await page.waitForLoadState("networkidle");
    // Buka kategori "Data" secara manual (bukan kategori aktif) lewat klik.
    await page.getByRole("button", { name: "Data" }).click();
    await expect(page.getByRole("link", { name: "Import Database" })).toBeVisible();

    // Reload: kategori aktif (Workspace) tetap terbuka DAN preferensi "Data"
    // yang baru saja dibuka user tetap dipulihkan dari localStorage.
    await page.reload();
    await expect(page.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Import Database" })).toBeVisible();
  });

  test("browser back/forward mempertahankan kategori aktif yang benar", async ({ page }) => {
    await page.goto("/workspace/overview");
    await expect(page.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: "Master Data", exact: true }).click();
    await page.waitForURL("**/workspace/master-data**");
    await expect(page.getByRole("link", { name: "Master Data", exact: true })).toHaveAttribute("aria-current", "page");

    await page.goBack();
    await page.waitForURL("**/workspace/overview**");
    await expect(page.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "page");

    await page.goForward();
    await page.waitForURL("**/workspace/master-data**");
    await expect(page.getByRole("link", { name: "Master Data", exact: true })).toHaveAttribute("aria-current", "page");
  });
});
