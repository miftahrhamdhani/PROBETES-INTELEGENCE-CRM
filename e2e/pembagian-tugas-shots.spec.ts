import { test } from "@playwright/test";
import { authStatePath } from "./credentials";

/**
 * Bukti visual redesign Pembagian Tugas. BUKAN test regresi (tidak ada assert
 * pass/fail) — hanya menangkap screenshot untuk direview manusia. Read-only:
 * tidak membuat/mengubah task apa pun.
 */
test.use({ storageState: authStatePath("admin") });

const SHOTS = [
  { name: "desktop", width: 1600, height: 1000 },
  { name: "tablet", width: 1024, height: 1200 },
  { name: "mobile", width: 390, height: 1400 },
];

async function openPage(page: import("@playwright/test").Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await page.getByText(/task •/).first().waitFor({ timeout: 60_000 });
}

for (const shot of SHOTS) {
  test(`screenshot Pembagian Tugas — ${shot.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await openPage(page, "/workspace/pembagian-tugas");
    await page.screenshot({ path: `artifacts/pembagian-tugas-${shot.name}.png`, fullPage: true });
  });
}

/** Tiap tahap kerja: Task / Broadcast / Completed. */
for (const tab of ["task", "broadcast", "completed"] as const) {
  test(`screenshot tab — ${tab}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openPage(page, tab === "task" ? "/workspace/pembagian-tugas" : `/workspace/pembagian-tugas?tab=${tab}`);
    await page.screenshot({ path: `artifacts/pembagian-tugas-tab-${tab}.png`, fullPage: false });
  });
}

/** Menu "Ubah Status" massal WAJIB memuat opsi Selesai (Completed). */
test("screenshot menu Ubah Status massal", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openPage(page, "/workspace/pembagian-tugas?tab=broadcast");

  const rowBoxes = page.locator('tbody input[type="checkbox"]');
  await rowBoxes.first().check();
  await page.getByRole("button", { name: "Ubah Status" }).click();
  await page.getByRole("menuitem", { name: /Completed/ }).waitFor({ timeout: 10_000 });
  await page.screenshot({ path: "artifacts/pembagian-tugas-menu-status.png", fullPage: false });
});

/** State tercentang: kotak biru WAJIB memperlihatkan ikon centang + bar aksi massal. */
test("screenshot Pembagian Tugas — baris tercentang", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openPage(page, "/workspace/pembagian-tugas");

  const rowBoxes = page.locator('tbody input[type="checkbox"]');
  for (const index of [0, 1, 2]) await rowBoxes.nth(index).check();

  await page.getByText(/tugas dipilih/).waitFor({ timeout: 10_000 });
  await page.screenshot({ path: "artifacts/pembagian-tugas-selected.png", fullPage: false });
});
