import { defineConfig, devices } from "@playwright/test";

/**
 * Browser E2E (docs prompt perbaikan §8). Jalan terhadap dev server lokal,
 * terhubung ke Neon DB yang sama dengan `npm run dev` (DATABASE_URL di .env)
 * — bukan database terpisah. Test yang menulis data SELALU membersihkan diri
 * sendiri (batalkan order/biaya yang dibuat) di akhir test, lihat e2e/README.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
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
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
