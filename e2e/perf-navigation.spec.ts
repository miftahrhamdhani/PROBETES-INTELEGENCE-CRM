import { expect, test } from "@playwright/test";
import { authStatePath } from "./credentials";

/**
 * Pengukuran navigasi (audit performa §C). BUKAN test regresi pass/fail —
 * spec ini mencetak angka baseline/after ke stdout. Threshold sengaja longgar
 * supaya tidak flaky di mesin berbeda; yang dipakai adalah angkanya.
 */
test.use({ storageState: authStatePath("admin") });

type Sample = { label: string; navMs: number; ttfbMs: number; lcpMs: number; requests: number; bytes: number };
const samples: Sample[] = [];

async function measure(page: import("@playwright/test").Page, label: string, action: () => Promise<void>) {
  let requests = 0;
  let bytes = 0;
  const onRequest = () => {
    requests += 1;
  };
  const onResponse = async (response: import("@playwright/test").Response) => {
    const length = Number(response.headers()["content-length"] ?? 0);
    if (Number.isFinite(length)) bytes += length;
  };
  page.on("request", onRequest);
  page.on("response", onResponse);

  const started = Date.now();
  await action();
  await page.waitForLoadState("networkidle");
  const navMs = Date.now() - started;

  page.off("request", onRequest);
  page.off("response", onResponse);

  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const lcp = performance.getEntriesByType("largest-contentful-paint").at(-1) as PerformanceEntry | undefined;
    return { ttfb: nav ? nav.responseStart - nav.requestStart : 0, lcp: lcp ? lcp.startTime : 0 };
  });

  samples.push({ label, navMs, ttfbMs: Math.round(timing.ttfb), lcpMs: Math.round(timing.lcp), requests, bytes });
}

test("ukur navigasi antar fitur workspace", async ({ page }) => {
  test.setTimeout(180_000);

  // Warm-up: hindari cold start ikut terhitung di sampel pertama.
  await page.goto("/workspace/overview");
  await page.waitForLoadState("networkidle");

  // Kategori sidebar tertutup saat SSR dan baru terbuka setelah hidrasi —
  // buka sekali supaya link anak bisa diklik (state-nya persist di localStorage).
  const workspaceToggle = page.getByRole("button", { name: "Workspace" });
  if (await workspaceToggle.getAttribute("aria-expanded") === "false") {
    await workspaceToggle.click();
  }
  await expect(page.getByRole("link", { name: "Pesanan", exact: true }).first()).toBeVisible();

  await measure(page, "cold /workspace/overview (full load)", async () => {
    await page.goto("/workspace/overview");
  });

  await measure(page, "Overview -> Pesanan (client nav)", async () => {
    await page.getByRole("link", { name: "Pesanan", exact: true }).first().click();
    await page.waitForURL("**/workspace/pesanan**");
  });

  await measure(page, "Pesanan -> Pembagian Tugas (client nav)", async () => {
    await page.getByRole("link", { name: "Pembagian Tugas", exact: true }).first().click();
    await page.waitForURL("**/workspace/pembagian-tugas**");
  });

  await measure(page, "Pembagian Tugas -> Master Data (client nav)", async () => {
    await page.getByRole("link", { name: "Master Data", exact: true }).first().click();
    await page.waitForURL("**/workspace/master-data**");
  });

  await measure(page, "Master Data -> Biaya Operasional (client nav)", async () => {
    await page.getByRole("link", { name: "Biaya Operasional", exact: true }).first().click();
    await page.waitForURL("**/workspace/biaya-operasional**");
  });

  await measure(page, "Biaya Operasional -> Overview (client nav)", async () => {
    await page.getByRole("link", { name: "Overview", exact: true }).first().click();
    await page.waitForURL("**/workspace/overview**");
  });

  await measure(page, "Overview -> Dashboard (client nav)", async () => {
    await page.goto("/");
  });

  console.log("\n================ NAVIGATION MEASUREMENTS ================");
  for (const s of samples) {
    console.log(
      `${s.label.padEnd(46)} nav=${String(s.navMs).padStart(6)}ms  ttfb=${String(s.ttfbMs).padStart(5)}ms  lcp=${String(s.lcpMs).padStart(5)}ms  req=${String(s.requests).padStart(3)}  bytes=${s.bytes}`
    );
  }
  console.log("========================================================\n");

  expect(samples.length).toBeGreaterThan(0);
});
