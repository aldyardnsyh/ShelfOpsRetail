// npm run smoke — naikkan stack prod-smoke lokal lalu jalankan smoke-prod.ps1.
// Windows tanpa `make` memakai ini sebagai padanan `make smoke`.
// Pakai: npm run smoke [-- --down] untuk menurunkan stack setelah selesai.
import { spawnSync } from "node:child_process";

const downOnly = process.argv.includes("--down");
const compose = (args) =>
  spawnSync("docker", ["compose", "--env-file", ".env.prod-smoke", "-f", "infra/docker-compose.prod.yml", ...args], {
    stdio: "inherit",
    shell: false,
  });

if (downOnly) {
  process.exit(compose(["down"]).status ?? 1);
}

let r = compose(["up", "-d"]);
if (r.status !== 0) process.exit(r.status ?? 1);

// Tunggu gateway sehat (maks ~200 detik).
const deadline = Date.now() + 200_000;
let healthy = false;
while (Date.now() < deadline) {
  for (const url of ["http://localhost/api/v1/healthz", "http://localhost:8080/healthz"]) {
    const probe = spawnSync("curl", ["-sf", url], { stdio: "ignore" });
    if (probe.status === 0) {
      healthy = true;
      break;
    }
  }
  if (healthy) break;
  await new Promise((res) => setTimeout(res, 5000));
}
if (!healthy) {
  console.error("smoke: gateway tidak sehat setelah 200 detik");
  process.exit(1);
}

const ps = process.platform === "win32" ? "powershell" : "pwsh";
const test = spawnSync(
  ps,
  ["-ExecutionPolicy", "Bypass", "-File", "scripts/smoke-prod.ps1", "-BaseUrl", "http://localhost"],
  { stdio: "inherit" },
);
process.exit(test.status ?? 1);
