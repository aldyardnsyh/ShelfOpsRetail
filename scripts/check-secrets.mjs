#!/usr/bin/env node
/**
 * check-secrets.mjs — gerbang sebelum commit/push.
 *
 * Memeriksa:
 *  1. File terlarang TIDAK boleh ter-track git (PRD, folder desain/Stitch, docs/private, research).
 *  2. Pola rahasia umum (API key, token, private key, password produksi) di file yang ter-track.
 *  3. File .env (selain .env.example) tidak boleh ter-track.
 *
 * Jalankan: node scripts/check-secrets.mjs   (atau: npm run check:secrets)
 * Exit code 1 = ada temuan → jangan push.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const FORBIDDEN_PATH_PATTERNS = [
  { re: /^PRD(.*)\.md$/i, why: "dokumen spesifikasi produk (privat)" },
  { re: /^stitch_[^/]*\//i, why: "hasil desain / Stitch (privat)" },
  { re: /^docs\/design\//i, why: "arah desain privat (publik: docs/design-tokens.md)" },
  { re: /^docs\/private\//i, why: "catatan privat" },
  { re: /^research\//i, why: "bahan riset lokal" },
  { re: /^notes-private\//i, why: "catatan privat" },
  { re: /(^|\/)\.env(\..+)?$/, allow: [/\.env\.example$/], why: "file .env tidak boleh di-track" },
  { re: /\.(pem|key|p12|pfx)$/i, why: "kunci privat" },
];

const SECRET_PATTERNS = [
  { re: /sk-[A-Za-z0-9]{20,}/, why: "OpenAI-style API key" },
  { re: /AIza[0-9A-Za-z\-_]{30,}/, why: "Google API key" },
  { re: /ghp_[A-Za-z0-9]{30,}/, why: "GitHub personal access token" },
  { re: /github_pat_[A-Za-z0-9_]{20,}/, why: "GitHub fine-grained PAT" },
  { re: /glpat-[A-Za-z0-9\-_]{20,}/, why: "GitLab token" },
  { re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, why: "private key" },
  { re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, why: "JWT literal" },
  { re: /(postgres|postgresql):\/\/[^\s:@]+:[^\s:@]{6,}@/i, why: "DB URL dengan password" },
  { re: /(api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_\-\/+=]{16,}["']/i, why: "nilai rahasia hard-coded" },
];

// Nilai dev/test yang sengaja ada di kode sumber. Produksi memakai env var
// (lihat deploy/env.production.example) dan tidak boleh menyalin literal ini.
const DEV_SAFE_LITERALS = [
  /dev-only-insecure-/i,
  /shelfops_dev_password/i,
  /test-only-(jwt|session)-secret/i,
  /postgres(ql)?:\/\/invalid:invalid@/i,
];

const ALLOWLIST_FILES = new Set([
  ".env.example",
  "scripts/check-secrets.mjs",
  "docs/DECISIONS.md",
  "docs/ai-log.md",
  "docs/runbook.md",
  "docs/HUMAN_TASKS.md",
  "docs/design-tokens.md",
  // Compose dev hanya berisi kredensial lokal sekali pakai (database di container
  // throwaway). Compose produksi WAJIB memakai ${VAR:?} tanpa nilai default.
  "infra/docker-compose.dev.yml",
]);

function tracked() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

const findings = [];

for (const file of tracked()) {
  for (const p of FORBIDDEN_PATH_PATTERNS) {
    if (p.allow?.some((a) => a.test(file))) continue;
    if (p.re.test(file)) findings.push({ file, kind: "path", why: p.why });
  }
  if (ALLOWLIST_FILES.has(file)) continue;
  let buf;
  try {
    const st = statSync(file);
    if (st.size > 2_000_000) continue;
    buf = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = buf.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (DEV_SAFE_LITERALS.some((re) => re.test(line))) return;
    for (const s of SECRET_PATTERNS) {
      if (s.re.test(line)) {
        findings.push({ file, line: i + 1, kind: "secret", why: s.why });
      }
    }
  });
}

if (findings.length === 0) {
  console.log(`OK — ${tracked().length} file ter-track, tidak ada file privat atau pola rahasia.`);
  process.exit(0);
}

console.error("TEMUAN — jangan commit/push sebelum dibersihkan:\n");
for (const f of findings) {
  console.error(`  ${f.file}${f.line ? `:${f.line}` : ""} → ${f.why} (${f.kind})`);
}
console.error(
  `\n${findings.length} temuan. Bila file privat sudah terlanjur ter-track: git rm --cached <file> (riwayat tetap harus dibersihkan bila sudah dipush).`,
);
process.exit(1);
