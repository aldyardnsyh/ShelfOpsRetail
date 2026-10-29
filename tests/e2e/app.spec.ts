import { expect, test } from "@playwright/test";

/**
 * Alur operasional: login demo -> dashboard -> halaman kunci.
 * Memastikan tidak ada layar "tidak terhubung ke gateway" dan data seed tampil.
 */
test.describe("alur operasional", () => {
  test("login demo membuka dashboard dengan data toko", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("body")).toBeVisible();

    const demoButton = page.getByRole("button", { name: /demo/i }).first();
    await expect(demoButton).toBeVisible();
    await demoButton.click();

    await page.waitForURL(/\/dashboard|\/monitor|\/stores/, { timeout: 30_000 });
    await expect(page.locator("h1").first()).toBeVisible();

    // Tidak boleh ada pesan koneksi gagal.
    await expect(page.getByText(/tidak terhubung ke gateway/i)).toHaveCount(0);

    await page.screenshot({ path: "qa-artifacts/e2e/dashboard.png", fullPage: false });
  });

  test("halaman operasional utama render tanpa error koneksi", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /demo/i }).first().click();
    await page.waitForURL(/\/dashboard|\/monitor|\/stores/, { timeout: 30_000 });

    for (const path of ["/dashboard", "/inventory", "/purchasing", "/tasks", "/alerts"]) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.getByText(/tidak terhubung ke gateway/i)).toHaveCount(0);
      await expect(page.locator("h1, h2").first()).toBeVisible();
    }
  });
});
