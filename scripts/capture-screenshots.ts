import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "assets/screenshots";
const BASE = process.env.BASE_URL ?? "http://localhost";

const pages: { path: string; file: string }[] = [
  { path: "/", file: "01-landing.png" },
  { path: "/dashboard", file: "03-dashboard.png" },
  { path: "/inventory", file: "04-inventory.png" },
  { path: "/purchasing", file: "05-purchasing.png" },
  { path: "/shelf", file: "06-audit.png" },
  { path: "/tasks", file: "07-tasks.png" },
  { path: "/copilot", file: "08-copilot.png" },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "id-ID",
  });
  const page = await context.newPage();

  // Landing tanpa sesi.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/01-landing.png` });

  // Login demo untuk halaman internal.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/02-login.png` });
  await page.getByRole("button", { name: /demo/i }).first().click();
  await page.waitForURL(/dashboard|monitor|stores/, { timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/03-dashboard.png` });

  for (const item of pages.slice(2)) {
    await page.goto(`${BASE}${item.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${item.file}` });
  }

  await browser.close();
  console.log("screenshots:", fs.readdirSync(OUT).join(", "));
}

main().catch((error) => {
  console.error("GAGAL:", error.message);
  process.exit(1);
});
