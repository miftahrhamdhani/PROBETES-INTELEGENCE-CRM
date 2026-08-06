import { expect, test } from "@playwright/test";
import { authStatePath } from "./credentials";

/**
 * Regresi: `useInfiniteRows` sebelumnya hanya percaya `initialData` sekali di
 * mount (dibandingkan lewat ref yang direkam saat mount, tidak pernah
 * diperbarui). Setiap perubahan filter setelahnya dianggap "initialData tidak
 * cocok" -> tabel dikosongkan ke `[]` LALU menjalankan fetch client kedua
 * (`loadMore()` -> server action) untuk data yang sebenarnya SUDAH dikirim
 * server lewat navigasi filter itu sendiri. Baik Customers, Group Membership,
 * maupun Cluster drill-down memakai hook yang sama.
 *
 * Bukti perbaikan: mengubah filter TIDAK memicu request Server Action
 * tambahan (ditandai header `next-action`) — hanya navigasi RSC dari
 * `router.push`. Baris tabel juga tidak pernah kosong di antara filter lama
 * dan filter baru.
 */
test.use({ storageState: authStatePath("admin") });

test("mengubah filter Cluster tidak memicu fetch client kedua yang berlebihan", async ({ page }) => {
  await page.goto("/customers");
  await expect(page.getByText(/customer$/).first()).toBeVisible();

  const serverActionRequests: string[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-action"]) serverActionRequests.push(request.url());
  });

  await page.getByLabel("Filter Cluster").selectOption({ index: 1 });
  await page.waitForURL((url) => url.searchParams.has("cluster"));
  await page.waitForLoadState("networkidle");

  expect(
    serverActionRequests,
    `filter change seharusnya hanya navigasi RSC, bukan Server Action tambahan:\n${serverActionRequests.join("\n")}`
  ).toEqual([]);
});

test("tabel tidak pernah menampilkan 0 customer sesaat saat filter berganti", async ({ page }) => {
  await page.goto("/customers");
  const countText = page.locator("text=/\\d[\\d.,]* customer/").first();
  await expect(countText).toBeVisible();

  const zeroFlashes: string[] = [];

  await page.getByLabel("Filter Cluster").selectOption({ index: 1 });
  // Sampling cepat berturut-turut selama transisi — tidak menjamin menangkap
  // SETIAP frame, tapi cukup untuk mendeteksi kalau tabel benar-benar melewati
  // status "0 customer" yang terlihat (bukan cuma teoretis).
  for (let i = 0; i < 15; i += 1) {
    const text = await countText.textContent().catch(() => null);
    if (text && /^0 customer/.test(text.trim())) zeroFlashes.push(text);
    await page.waitForTimeout(20);
  }

  expect(zeroFlashes, "tabel sempat menampilkan 0 customer saat filter berganti").toEqual([]);
});
