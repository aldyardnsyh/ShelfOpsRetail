/**
 * Regenerates `apps/web/fixtures/*.json` from a running ShelfOps gateway.
 *
 * Demo build on Vercel serves these fixtures instead of calling the API, so the
 * files must keep the *same shape* as the gateway response. Regenerate after
 * any API contract change:
 *
 *   node scripts/sync-demo-fixtures.mjs                 # http://localhost:8080
 *   DEMO_API_URL=https://api.example.com node scripts/sync-demo-fixtures.mjs
 *
 * The script creates a throwaway demo session, so it never needs credentials.
 * It is intentionally dependency-free (Node >= 22 global fetch).
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps", "web", "fixtures");
const baseUrl = (process.env.DEMO_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");

const jar = new Map();

function rememberCookies(response) {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (jar.size > 0) {
    headers.set(
      "cookie",
      [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
    );
  }
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  rememberCookies(response);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const get = (path) => request(path);

async function writeFixture(name, data) {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(join(outDir, name), body, "utf8");
  const unit = Array.isArray(data)
    ? `${data.length} item`
    : typeof data === "object" && data !== null
      ? `${Object.keys(data).length} key (${Object.keys(data).slice(0, 6).join(", ")})`
      : typeof data;
  console.log(`  ${name.padEnd(26)} ${String(body.length).padStart(8)} B  ${unit}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  console.log(`Syncing demo fixtures from ${baseUrl}`);
  await request("/api/v1/auth/demo", { method: "POST" });

  const me = await get("/api/v1/me");
  const workspace = await get("/api/v1/workspace");
  const kpis = await get("/api/v1/insights/kpis");
  const trend = await get("/api/v1/insights/trend?granularity=day");
  const ranking = await get("/api/v1/insights/ranking?limit=10");
  const alerts = await get("/api/v1/alerts?limit=50");
  const stores = await get("/api/v1/stores");
  const audits = await get("/api/v1/audits?limit=20");
  const documents = await get("/api/v1/documents?limit=50");
  const conversations = await get("/api/v1/conversations?limit=50");
  const members = await get("/api/v1/workspace/members");
  const auditLogs = await get("/api/v1/audit?limit=50");
  const inventory = await get("/api/v1/inventory");
  const pricing = await get("/api/v1/pricing");
  const tasks = await get("/api/v1/tasks?limit=50");
  const purchasing = await get("/api/v1/purchasing");
  const tracking = await get("/api/v1/tracking?limit=50");
  const monitor = await get("/api/v1/monitor");
  const reports = await get("/api/v1/reports");
  const integrations = await get("/api/v1/integrations");
  const benchmarks = await get("/api/v1/benchmarks");
  const evals = await get("/api/v1/evals/overview");
  const traces = await get("/api/v1/traces?limit=50");

  const auditItems = audits.items ?? [];
  const documentItems = documents.items ?? [];
  const conversationItems = conversations.items ?? [];
  const traceItems = traces.traces ?? traces.items ?? [];

  const auditDetails = {};
  for (const session of auditItems) {
    auditDetails[session.id] = await get(`/api/v1/audits/${session.id}`);
  }

  const documentDetails = {};
  const documentChunks = {};
  for (const document of documentItems) {
    documentDetails[document.id] = await get(`/api/v1/documents/${document.id}`);
    const chunks = await get(`/api/v1/documents/${document.id}/chunks?limit=200`);
    documentChunks[document.id] = Array.isArray(chunks) ? chunks : (chunks.items ?? []);
  }

  const conversationDetails = {};
  for (const conversation of conversationItems) {
    conversationDetails[conversation.id] = await get(`/api/v1/conversations/${conversation.id}`);
  }

  const traceDetails = {};
  for (const trace of traceItems) {
    const id = trace.request_id ?? trace.id;
    if (id) traceDetails[id] = await get(`/api/v1/traces/${id}`);
  }

  console.log("Writing fixtures:");
  await writeFixture("me.json", me);
  await writeFixture("workspace.json", workspace);
  await writeFixture("kpis.json", kpis);
  await writeFixture("trend.json", trend);
  await writeFixture("ranking.json", ranking);
  await writeFixture("alerts.json", alerts);
  await writeFixture("stores.json", stores);
  await writeFixture("audits.json", audits);
  await writeFixture("audit-details.json", auditDetails);
  await writeFixture("documents.json", documents);
  await writeFixture("document-details.json", documentDetails);
  await writeFixture("document-chunks.json", documentChunks);
  await writeFixture("conversations.json", conversations);
  await writeFixture("conversation-details.json", conversationDetails);
  await writeFixture("members.json", members);
  await writeFixture(
    "audit-logs.json",
    Array.isArray(auditLogs) ? auditLogs : (auditLogs.items ?? []),
  );
  await writeFixture("inventory.json", inventory);
  await writeFixture("pricing.json", pricing);
  await writeFixture("tasks.json", tasks);
  await writeFixture("purchasing.json", purchasing);
  await writeFixture("tracking.json", tracking);
  await writeFixture("monitor.json", monitor);
  await writeFixture("reports.json", reports);
  await writeFixture("integrations.json", integrations);
  await writeFixture("benchmark.json", benchmarks);
  await writeFixture("evals.json", evals);
  await writeFixture("traces.json", traces);
  await writeFixture("trace-details.json", traceDetails);

  // Fixture lama yang sudah tidak dipakai (bentuk khusus komponen) dibersihkan.
  const keep = new Set([
    "me.json", "workspace.json", "kpis.json", "trend.json", "ranking.json",
    "alerts.json", "stores.json", "audits.json", "audit-details.json",
    "documents.json", "document-details.json", "document-chunks.json",
    "conversations.json", "conversation-details.json", "members.json",
    "audit-logs.json", "inventory.json", "pricing.json", "tasks.json",
    "purchasing.json", "tracking.json", "monitor.json", "reports.json",
    "integrations.json", "benchmark.json", "evals.json", "traces.json",
    "trace-details.json", "detection-result.json",
    "shelf-1.svg", "shelf-2.svg", "shelf-3.svg",
  ]);
  for (const entry of await readdir(outDir)) {
    if (!keep.has(entry)) {
      console.log(`  removing stale fixture ${entry}`);
      await writeFile(join(outDir, entry), "", "utf8");
      const { rm } = await import("node:fs/promises");
      await rm(join(outDir, entry), { force: true });
    }
  }

  console.log(
    `Done: ${auditItems.length} audits, ${documentItems.length} documents, ` +
      `${conversationItems.length} conversations, ${traceItems.length} traces.`,
  );
}

main().catch((error) => {
  console.error(`Fixture sync failed: ${error.message}`);
  process.exitCode = 1;
});
