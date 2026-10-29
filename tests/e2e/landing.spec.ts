import { expect, test } from "@playwright/test";

/**
 * Landing page: bukti render nyata + copyright PSHT wajib tampil.
 */
test.describe("landing", () => {
  test("menampilkan hero, CTA demo, dan copyright PSHT", async ({ page }) => {
    await page.goto("/");

    // Hero utama tampil.
    await expect(page.locator("h1").first()).toBeVisible();

    // CTA demo ada dan bisa diklik (tidak harus menunggu navigasi).
    const demoCta = page.getByRole("button", { name: /demo|coba/i }).first();
    await expect(demoCta).toBeVisible();

    // Copyright wajib ada di footer.
    const copyright = page.getByText(/Hak cipta \(c\) 2026 PogungSoftwareHouseTeam \(PSHT\)\. Seluruh hak dilindungi\./);
    await expect(copyright).toBeVisible();

    await page.screenshot({ path: "qa-artifacts/e2e/landing.png", fullPage: false });
  });

  test("footer tetap memuat copyright di viewport mobile", async ({ page }) => {
    await page.goto("/");
    await page.getByText(/PogungSoftwareHouseTeam \(PSHT\)/).scrollIntoViewIfNeeded();
    await expect(page.getByText(/PogungSoftwareHouseTeam \(PSHT\)/)).toBeVisible();
  });
});
