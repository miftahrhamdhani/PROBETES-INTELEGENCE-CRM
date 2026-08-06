import { test, expect, type Page } from "@playwright/test";
import { authStatePath } from "./credentials";

// Samakan dengan todayInJakarta() yang dipakai halaman (bukan UTC).
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const COST_NAME = `E2E TEST Biaya ${Date.now()}`;
const AMOUNT = 12_345;

async function kpiValue(page: Page, label: string): Promise<string> {
  const value = await page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]").innerText();
  return value.trim();
}

async function openCostDetailByName(page: Page, name: string) {
  await page.goto("/workspace/biaya-operasional");
  await page.getByText(name).first().click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test.describe("Biaya Operasional — approval chain Leader -> SPV -> Direktur", () => {
  test("Leader membuat & mengajukan; CRM biasa ditolak; SPV & Direktur menyetujui; COM masuk Overview setelah DIRECTOR_APPROVED", async ({ browser }) => {
    // --- 0) CRM biasa (Sarah) tidak melihat tombol "Ajukan Biaya" sama sekali.
    const crmCtx = await browser.newContext({ storageState: authStatePath("crm") });
    const crmPage = await crmCtx.newPage();
    await crmPage.goto("/workspace/biaya-operasional");
    await expect(crmPage.getByRole("button", { name: "Ajukan Biaya" })).toHaveCount(0);
    await crmCtx.close();

    // --- 1) Leader (Feny) membuat draft lalu mengajukan.
    const leaderCtx = await browser.newContext({ storageState: authStatePath("leader") });
    const leaderPage = await leaderCtx.newPage();
    await leaderPage.goto("/workspace/biaya-operasional");
    await leaderPage.getByRole("button", { name: "Ajukan Biaya" }).click();
    await leaderPage.locator("input[type='date']").fill(TODAY);
    await leaderPage.locator("input[type='number']").fill(String(AMOUNT));
    await leaderPage.locator(".space-y-1").filter({ has: leaderPage.getByText("Nama Biaya", { exact: false }) }).locator("input").fill(COST_NAME);
    await leaderPage.getByRole("button", { name: "Simpan Draft" }).click();
    await expect(leaderPage.getByText(COST_NAME).first()).toBeVisible();

    await openCostDetailByName(leaderPage, COST_NAME);
    await leaderPage.getByRole("button", { name: "Ajukan", exact: true }).click();
    await expect(leaderPage.getByRole("dialog").getByText("SUBMITTED")).toBeVisible();
    // Leader adalah pembuat -> tidak boleh melihat tombol approval untuk pengajuannya sendiri.
    await expect(leaderPage.getByRole("button", { name: "Setujui SPV" })).toHaveCount(0);
    await leaderCtx.close();

    // --- 2) SPV (Ni'mah) menyetujui.
    const spvCtx = await browser.newContext({ storageState: authStatePath("spv") });
    const spvPage = await spvCtx.newPage();
    await openCostDetailByName(spvPage, COST_NAME);
    await spvPage.getByRole("button", { name: "Setujui SPV" }).click();
    await expect(spvPage.getByRole("dialog").getByText("SPV_APPROVED")).toBeVisible();
    await spvCtx.close();

    // --- 3) Direktur (Rahman) memberi approval akhir.
    const direkturCtx = await browser.newContext({ storageState: authStatePath("direktur") });
    const direkturPage = await direkturCtx.newPage();
    await openCostDetailByName(direkturPage, COST_NAME);
    await direkturPage.getByRole("button", { name: "Setujui Direktur" }).click();
    await expect(direkturPage.getByRole("dialog").getByText("DIRECTOR_APPROVED")).toBeVisible();
    await direkturCtx.close();

    // --- 4) COM Overview pada tanggal biaya ini mencakup nominal setelah DIRECTOR_APPROVED.
    const adminCtx = await browser.newContext({ storageState: authStatePath("admin") });
    const adminPage = await adminCtx.newPage();
    await adminPage.goto(`/workspace/overview?from=${TODAY}&to=${TODAY}`);
    const comAfterApproval = Number((await kpiValue(adminPage, "COM")).replace(/\D/g, ""));
    expect(comAfterApproval).toBeGreaterThanOrEqual(AMOUNT);

    // --- 5) Cleanup: batalkan biaya (hanya ADMIN yang boleh membatalkan DIRECTOR_APPROVED)
    //     supaya data test tidak permanen memengaruhi COM Overview yang sesungguhnya.
    await openCostDetailByName(adminPage, COST_NAME);
    await adminPage.getByRole("button", { name: "Batalkan", exact: true }).click();
    await expect(adminPage.getByRole("dialog").getByText("CANCELLED")).toBeVisible();

    await adminPage.goto(`/workspace/overview?from=${TODAY}&to=${TODAY}`);
    const comAfterCancel = Number((await kpiValue(adminPage, "COM")).replace(/\D/g, ""));
    expect(comAfterCancel).toBe(comAfterApproval - AMOUNT);
    await adminCtx.close();
  });
});
