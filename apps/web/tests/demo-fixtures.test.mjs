/**
 * Kontrak fixture demo.
 *
 * Mode demo menyajikan `apps/web/fixtures/*.json` seolah-olah respons gateway.
 * Test ini menjaga janji tersebut: bentuk payload, integritas referensi antar
 * file, dan tidak adanya fixture yatim. Jalankan setelah
 * `node scripts/sync-demo-fixtures.mjs`.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");
const read = (name) => JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));

const REQUIRED = [
  "me.json",
  "workspace.json",
  "kpis.json",
  "trend.json",
  "ranking.json",
  "alerts.json",
  "stores.json",
  "audits.json",
  "audit-details.json",
  "documents.json",
  "document-details.json",
  "document-chunks.json",
  "conversations.json",
  "conversation-details.json",
  "members.json",
  "audit-logs.json",
  "inventory.json",
  "pricing.json",
  "tasks.json",
  "purchasing.json",
  "tracking.json",
  "monitor.json",
  "reports.json",
  "integrations.json",
  "benchmark.json",
  "evals.json",
  "traces.json",
  "trace-details.json",
  "detection-result.json",
];

test("semua fixture wajib ada dan merupakan JSON valid", () => {
  for (const name of REQUIRED) {
    const path = join(fixturesDir, name);
    assert.ok(existsSync(path), `fixture hilang: ${name}`);
    assert.doesNotThrow(() => read(name), `fixture bukan JSON valid: ${name}`);
  }
});

test("demo-data hanya memuat fixture yang benar-benar ada", () => {
  const source = readFileSync(join(here, "..", "src", "lib", "demo-data.ts"), "utf8");
  const referenced = [...source.matchAll(/fixtures\/([\w.-]+\.json)/g)].map(
    (match) => match[1],
  );
  assert.ok(referenced.length >= 20, "demo-data.ts tidak memuat fixture yang diharapkan");
  for (const name of new Set(referenced)) {
    assert.ok(existsSync(join(fixturesDir, name)), `demo-data.ts menunjuk fixture hilang: ${name}`);
  }
});

test("setiap dokumen punya detail dan chunk dengan versi yang konsisten", () => {
  const page = read("documents.json");
  const details = read("document-details.json");
  const chunks = read("document-chunks.json");
  assert.ok(page.items.length > 0, "daftar dokumen kosong");

  for (const item of page.items) {
    const detail = details[item.id];
    assert.ok(detail, `detail dokumen hilang untuk ${item.id}`);
    assert.equal(detail.id, item.id);
    assert.ok(
      detail.versions.some((version) => version.version === detail.current_version),
      `current_version ${detail.current_version} tidak ada di versions (${item.id})`,
    );
    assert.ok(
      ["ready", "pending", "partial", "missing"].includes(detail.embedding_status),
      `embedding_status tak dikenal: ${detail.embedding_status}`,
    );
    assert.ok(Array.isArray(chunks[item.id]), `chunk hilang untuk ${item.id}`);
    for (const chunk of chunks[item.id]) {
      assert.equal(chunk.document_id, item.id);
      assert.ok(chunk.content.length > 0, "chunk tanpa isi");
      assert.ok(chunk.ordinal >= 0, "ordinal chunk tidak valid");
    }
  }
});

test("setiap sesi audit punya detail lengkap", () => {
  const page = read("audits.json");
  const details = read("audit-details.json");
  assert.ok(page.items.length > 0);

  for (const item of page.items) {
    const detail = details[item.id];
    assert.ok(detail, `detail audit hilang untuk ${item.id}`);
    assert.equal(detail.session.id, item.id);
    assert.ok(Array.isArray(detail.images), "images bukan array");
    assert.ok(detail.metrics && typeof detail.metrics === "object", "metrics hilang");
    for (const detection of Object.values(detail.detections_by_image ?? {}).flat()) {
      assert.equal(detection.bbox.length, 4, "bbox harus 4 angka");
    }
  }
});

test("setiap percakapan punya detail dengan pesan", () => {
  const page = read("conversations.json");
  const details = read("conversation-details.json");
  assert.ok(page.items.length > 0);

  for (const item of page.items) {
    const detail = details[item.id];
    assert.ok(detail, `detail percakapan hilang untuk ${item.id}`);
    assert.ok(Array.isArray(detail.messages) && detail.messages.length > 0, "pesan kosong");
    for (const message of detail.messages) {
      assert.ok(["user", "assistant", "tool", "system"].includes(message.role));
      assert.ok(typeof message.content === "string");
    }
  }
});

test("trace menggabungkan pertanyaan dan jawaban dalam satu request", () => {
  const page = read("traces.json");
  const details = read("trace-details.json");
  assert.ok(page.traces.length > 0, "daftar trace kosong");

  for (const trace of page.traces) {
    const id = trace.request_id ?? trace.id;
    assert.ok(id, "trace tanpa request_id");
    assert.ok(trace.query && trace.query.length > 0, `query kosong pada ${id}`);
    const detail = details[id];
    assert.ok(detail, `detail trace hilang untuk ${id}`);
    assert.equal(detail.request_id, id);
    assert.ok(detail.query.length > 0, `detail trace tanpa query: ${id}`);
    assert.ok(detail.steps.length >= 1, `detail trace tanpa langkah: ${id}`);
    for (const step of detail.steps) {
      assert.ok(typeof step.stage === "string" && step.stage.length > 0);
      assert.ok(typeof step.latency_ms === "number");
      assert.ok(typeof step.status === "string");
    }
  }
});

test("payload domain operasional memakai bentuk gateway", () => {
  const tasks = read("tasks.json");
  assert.ok(Array.isArray(tasks.items), "tasks.items harus array");
  for (const task of tasks.items) {
    assert.ok(task.id && task.title && task.status && task.priority);
    assert.ok(Array.isArray(task.checklist));
  }

  const tracking = read("tracking.json");
  assert.ok(Array.isArray(tracking), "tracking harus array shipment");
  for (const shipment of tracking) {
    assert.ok(shipment.id && shipment.status && shipment.eta);
  }

  for (const name of ["inventory", "pricing", "purchasing", "monitor", "reports", "integrations"]) {
    const payload = read(`${name}.json`);
    assert.ok(
      payload && typeof payload === "object" && !Array.isArray(payload),
      `${name}.json harus objek`,
    );
    assert.ok(Object.keys(payload).length > 0, `${name}.json kosong`);
  }

  const benchmarks = read("benchmark.json");
  assert.ok(benchmarks.meta?.testbed, "benchmark.meta.testbed hilang");
  assert.ok(Array.isArray(benchmarks.rows));

  const evals = read("evals.json");
  assert.ok(Array.isArray(evals.datasets));
  assert.ok(Array.isArray(evals.runs));
});

test("identitas demo tidak membocorkan kredensial", () => {
  const me = read("me.json");
  assert.equal(me.demo, true);
  assert.equal(me.workspace.is_demo, true);
  assert.ok(!("password" in me.user), "me.user tidak boleh memuat password");
  assert.ok(
    !JSON.stringify(read("members.json")).includes("password_hash"),
    "members tidak boleh memuat hash sandi",
  );
});