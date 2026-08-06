import { defineConfig, devices } from "@playwright/test";

/**
 * Browser E2E (docs prompt perbaikan §8). Jalan terhadap dev server lokal,
 * terhubung ke Neon DB yang sama dengan `npm run dev` (DATABASE_URL di .env)
 * — bukan database terpisah. Test yang menulis data SELALU membersihkan diri
 * sendiri (batalkan order/biaya yang dibuat) di akhir test, lihat e2e/README.
 */
/**
 * Target bisa ditimpa lewat `E2E_BASE_URL` — dipakai untuk mengukur build
 * PRODUCTION (`npm run build && npm start -- -p 3001`) tanpa mengganggu dev
 * server yang sedang jalan di :3000. Angka performa dev vs production berbeda
 * jauh (dev meng-compile tiap route saat pertama dibuka), jadi pengukuran
 * yang dipakai untuk keputusan HARUS dari production build.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Workspace CRM adalah tool desktop internal (docs prompt §13 "full width,
    // compact") — viewport lebar supaya layout multi-kolom xl: benar-benar aktif,
    // sama seperti operator sungguhan memakainya.
    viewport: { width: 1600, height: 1000 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } },
    },
  ],
  // Saat E2E_BASE_URL diisi, server dianggap sudah disiapkan pemanggil
  // (mis. `npm start` production di port lain) — Playwright tidak menyalakan
  // dev server sendiri supaya tidak salah mengukur target yang berbeda.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
