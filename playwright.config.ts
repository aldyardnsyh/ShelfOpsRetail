import { defineConfig, devices } from "@playwright/test";

/**
 * E2E ShelfOps.
 *
 * Dijalankan terhadap stack yang SUDAH hidup (docker compose produksi lokal
 * atau Vercel demo). Tidak menyalakan dev server sendiri — itu penyebab
 * terminal menggantung.
 *
 *   BASE_URL=http://localhost npx playwright test --reporter=line --workers=1
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
