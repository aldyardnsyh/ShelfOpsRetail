import "server-only";

import type {
  Alert,
  AuditDetail,
  AuditSession,
  Conversation,
  ConversationDetail,
  DocumentPage,
  Kpis,
  MeResponse,
  Member,
  Store,
  StoreRank,
  TrendPoint,
  Workspace,
} from "@shelfops/api-client";

import type {
  AuditLogEntry,
  DetectionResult,
} from "./types";

/**
 * Fixture demo dimuat secara lazy, hanya pada build/runtime dengan
 * NEXT_PUBLIC_DEMO_MODE aktif. Dengan begitu bundle production tidak pernah
 * menyertakan data contoh dan tidak ada jalur di mana data fiktif tampil
 * sebagai data nyata.
 *
 * Bentuk setiap fixture identik dengan respons gateway (lihat
 * `scripts/sync-demo-fixtures.mjs`), sehingga mode demo dan mode live memakai
 * kontrak yang sama.
 */

type JsonModule = { default: unknown };

async function load<T>(loader: () => Promise<JsonModule>): Promise<T> {
  return (await loader()).default as T;
}

async function loadMap<T>(
  loader: () => Promise<JsonModule>,
): Promise<Record<string, T>> {
  return (await loader()).default as Record<string, T>;
}

export interface DocumentDetailPayload {
  id: string;
  title: string;
  mime: string;
  language: string;
  source_uri: string | null;
  status: string;
  current_version: number;
  size_bytes: number;
  chunk_count: number;
  error: string | null;
  last_indexed_at: string | null;
  embedding_status: string;
  versions: {
    version: number;
    status: string;
    size_bytes: number;
    created_at: string;
  }[];
  created_at: string;
  updated_at: string;
}

export interface DocumentChunkPayload {
  id: string;
  document_id?: string;
  version: number;
  ordinal: number;
  page: number | null;
  heading_path: string;
  token_count: number;
  content: string;
  created_at?: string;
}

export interface TraceDetailPayload {
  request_id: string;
  created_at: string;
  query: string;
  latency_ms: number;
  steps: {
    stage: string;
    span_id: string;
    latency_ms: number;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    model?: string | null;
    provider?: string | null;
    status: string;
    meta?: Record<string, unknown>;
  }[];
  answer: string;
  citations: unknown[];
}

export const demoData = {
  // Demo memperlihatkan seluruh menu, termasuk halaman admin. Peran fixture
  // dari gateway adalah analyst; untuk pratinjau kita naikkan ke admin agar
  // tidak ada halaman yang tampil "Akses ditolak" tanpa alasan.
  me: async () => {
    const me = await load<MeResponse>(() => import("../../fixtures/me.json"));
    return { ...me, role: "admin" as MeResponse["role"] };
  },
  workspace: () => load<Workspace>(() => import("../../fixtures/workspace.json")),
  kpis: () => load<Kpis>(() => import("../../fixtures/kpis.json")),
  trend: () => load<TrendPoint[]>(() => import("../../fixtures/trend.json")),
  ranking: () => load<StoreRank[]>(() => import("../../fixtures/ranking.json")),
  alerts: () => load<Alert[]>(() => import("../../fixtures/alerts.json")),
  stores: () => load<Store[]>(() => import("../../fixtures/stores.json")),
  audits: () =>
    load<{ items: AuditSession[]; next_cursor: string | null }>(
      () => import("../../fixtures/audits.json"),
    ),
  auditDetail: async (id: string) =>
    (
      await loadMap<AuditDetail>(
        () => import("../../fixtures/audit-details.json"),
      )
    )[id],
  documents: () =>
    load<DocumentPage>(() => import("../../fixtures/documents.json")),
  documentDetail: async (id: string) =>
    (
      await loadMap<DocumentDetailPayload>(
        () => import("../../fixtures/document-details.json"),
      )
    )[id],
  documentChunks: async (id: string) =>
    (
      await loadMap<DocumentChunkPayload[]>(
        () => import("../../fixtures/document-chunks.json"),
      )
    )[id] ?? [],
  conversations: () =>
    load<{ items: Conversation[]; next_cursor: string | null }>(
      () => import("../../fixtures/conversations.json"),
    ),
  conversationDetail: async (id: string) =>
    (
      await loadMap<ConversationDetail>(
        () => import("../../fixtures/conversation-details.json"),
      )
    )[id],
  members: () => load<Member[]>(() => import("../../fixtures/members.json")),
  auditLogs: () =>
    load<AuditLogEntry[]>(() => import("../../fixtures/audit-logs.json")),
  inventory: () => load<unknown>(() => import("../../fixtures/inventory.json")),
  pricing: () => load<unknown>(() => import("../../fixtures/pricing.json")),
  tasks: () => load<unknown>(() => import("../../fixtures/tasks.json")),
  purchasing: () => load<unknown>(() => import("../../fixtures/purchasing.json")),
  tracking: async () =>
    (
      await load<unknown[]>(() => import("../../fixtures/tracking.json"))
    ),
  monitor: () => load<unknown>(() => import("../../fixtures/monitor.json")),
  reports: () => load<unknown>(() => import("../../fixtures/reports.json")),
  integrations: () =>
    load<unknown>(() => import("../../fixtures/integrations.json")),
  benchmarks: () => load<unknown>(() => import("../../fixtures/benchmark.json")),
  evals: () => load<unknown>(() => import("../../fixtures/evals.json")),
  traces: () =>
    load<{ traces: unknown[] }>(() => import("../../fixtures/traces.json")),
  traceDetail: async (id: string) =>
    (
      await loadMap<TraceDetailPayload>(
        () => import("../../fixtures/trace-details.json"),
      )
    )[id],
  detectionResult: () =>
    load<DetectionResult>(() => import("../../fixtures/detection-result.json")),
};
