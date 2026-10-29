import "server-only";

import {
  ApiError,
  type Alert,
  type AuditDetail,
  type AuditSession,
  type Conversation,
  type ConversationDetail,
  type DocumentPage,
  type Kpis,
  type MeResponse,
  type Member,
  type Store,
  type StoreRank,
  type TrendPoint,
  type Workspace,
} from "@shelfops/api-client";

import { getServerApi } from "./api";
import { DEMO_MODE } from "./demo";
import { demoData } from "./demo-data";
import type {
  AuditLogEntry,
  DataResult,
  DetectionResult,
  UiProblem,
} from "./types";

const ok = <T>(data: T): DataResult<T> => ({ ok: true, data });
const fail = (error: UiProblem): DataResult<never> => ({ ok: false, error });

function toUiProblem(error: unknown, response?: Response): UiProblem {
  if (error instanceof ApiError) {
    return {
      title: error.problem.title,
      detail: error.problem.detail,
      status: error.problem.status,
      traceId: error.problem.trace_id || undefined,
      retryable: error.problem.status === 429 || error.problem.status >= 500,
    };
  }

  if (response) {
    return {
      title: "Permintaan gagal",
      detail: `Gateway mengembalikan status ${response.status}.`,
      status: response.status,
      traceId:
        response.headers.get("x-trace-id") ??
        response.headers.get("x-request-id") ??
        undefined,
      retryable: response.status === 429 || response.status >= 500,
    };
  }

  if (error instanceof Error) {
    return {
      title: "Tidak terhubung ke gateway",
      detail: error.message,
      status: 0,
      retryable: true,
    };
  }

  return {
    title: "Tidak terhubung ke gateway",
    detail: undefined,
    status: 0,
    retryable: true,
  };
}

async function unwrap<T>(promise: Promise<{
  data?: T;
  error?: unknown;
  response: Response;
}>): Promise<DataResult<T>> {
  try {
    const result = await promise;
    if (result.response.ok && result.data !== undefined) {
      return ok(result.data);
    }
    return fail(toUiProblem(result.error, result.response));
  } catch (error) {
    return fail(toUiProblem(error));
  }
}

async function unwrapList<T>(promise: Promise<{
  data?: T[];
  error?: unknown;
  response: Response;
}>): Promise<DataResult<T[]>> {
  const result = await unwrap(promise);
  if (!result.ok) return result;
  return ok(result.data ?? []);
}

const notFound = (title: string, entity: string): DataResult<never> =>
  fail({
    title,
    detail: `ID ${entity} tidak ada di data demo.`,
    status: 404,
    retryable: false,
  });

export async function getMe(): Promise<DataResult<MeResponse>> {
  if (DEMO_MODE) return ok(await demoData.me());
  const api = await getServerApi();
  return unwrap(api.auth.me());
}

export async function getWorkspace(): Promise<DataResult<Workspace>> {
  if (DEMO_MODE) return ok(await demoData.workspace());
  const api = await getServerApi();
  return unwrap(api.workspace.get());
}

export async function getKpis(): Promise<DataResult<Kpis>> {
  if (DEMO_MODE) return ok(await demoData.kpis());
  const api = await getServerApi();
  return unwrap(api.insights.kpis());
}

export async function getTrend(): Promise<DataResult<TrendPoint[]>> {
  if (DEMO_MODE) return ok(await demoData.trend());
  const api = await getServerApi();
  return unwrapList(api.insights.trend({ granularity: "day" }));
}

export async function getRanking(): Promise<DataResult<StoreRank[]>> {
  if (DEMO_MODE) return ok(await demoData.ranking());
  const api = await getServerApi();
  return unwrapList(api.insights.ranking({ limit: 10 }));
}

export async function getAlerts(query?: {
  status?: "open" | "acknowledged" | "resolved";
  severity?: "low" | "medium" | "high";
  store_id?: string;
  limit?: number;
}): Promise<DataResult<Alert[]>> {
  if (DEMO_MODE) {
    let items = await demoData.alerts();
    if (query?.status) items = items.filter((alert) => alert.status === query.status);
    if (query?.severity) {
      items = items.filter((alert) => alert.severity === query.severity);
    }
    if (query?.store_id) {
      items = items.filter((alert) => alert.store_id === query.store_id);
    }
    if (query?.limit) items = items.slice(0, query.limit);
    return ok(items);
  }
  const api = await getServerApi();
  return unwrapList(api.alerts.list(query));
}

export async function getStores(): Promise<DataResult<Store[]>> {
  if (DEMO_MODE) return ok(await demoData.stores());
  const api = await getServerApi();
  return unwrapList(api.stores.list());
}

export async function getAudits(query?: {
  store_id?: string;
  limit?: number;
}): Promise<DataResult<AuditSession[]>> {
  if (DEMO_MODE) {
    let items = (await demoData.audits()).items;
    if (query?.store_id) {
      items = items.filter((session) => session.store_id === query.store_id);
    }
    if (query?.limit) items = items.slice(0, query.limit);
    return ok(items);
  }
  const api = await getServerApi();
  const result = await unwrap(api.audit.list(query));
  if (!result.ok) return result;
  return ok((result.data as { items?: AuditSession[] }).items ?? []);
}

export async function getAuditDetail(
  id: string,
): Promise<DataResult<AuditDetail>> {
  if (DEMO_MODE) {
    const detail = await demoData.auditDetail(id);
    return detail ? ok(detail) : notFound("Sesi audit tidak ditemukan", "sesi audit");
  }
  const api = await getServerApi();
  return unwrap(api.audit.get(id));
}

export async function getDocuments(): Promise<DataResult<DocumentPage>> {
  if (DEMO_MODE) return ok(await demoData.documents());
  const api = await getServerApi();
  return unwrap(api.documents.list());
}

export type {
  DocumentChunkPayload as DocumentChunkEntry,
  DocumentDetailPayload as DocumentDetail,
} from "./demo-data";

export async function getDocument(
  id: string,
): Promise<DataResult<import("./demo-data").DocumentDetailPayload>> {
  if (DEMO_MODE) {
    const detail = await demoData.documentDetail(id);
    return detail ? ok(detail) : notFound("Dokumen tidak ditemukan", "dokumen");
  }
  const api = await getServerApi();
  return unwrap(
    api.documents.get(id) as unknown as Promise<{
      data?: import("./demo-data").DocumentDetailPayload;
      error?: unknown;
      response: Response;
    }>,
  );
}

export async function getDocumentChunks(
  id: string,
): Promise<DataResult<import("./demo-data").DocumentChunkPayload[]>> {
  if (DEMO_MODE) return ok(await demoData.documentChunks(id));
  const api = await getServerApi();
  const result = await unwrap(
    api.documents.chunks(id, { limit: 200 }) as unknown as Promise<{
      data?: import("./demo-data").DocumentChunkPayload[];
      error?: unknown;
      response: Response;
    }>,
  );
  return result;
}

export async function getDetectionResult(): Promise<DetectionResult> {
  return demoData.detectionResult();
}

export async function getConversations(): Promise<DataResult<Conversation[]>> {
  if (DEMO_MODE) return ok((await demoData.conversations()).items);
  const api = await getServerApi();
  const result = await unwrap(api.chat.listConversations());
  if (!result.ok) return result;
  return ok((result.data as { items?: Conversation[] }).items ?? []);
}

export async function getConversation(
  id: string,
): Promise<DataResult<ConversationDetail>> {
  if (DEMO_MODE) {
    const detail = await demoData.conversationDetail(id);
    return detail
      ? ok(detail)
      : notFound("Percakapan tidak ditemukan", "percakapan");
  }
  const api = await getServerApi();
  return unwrap(api.chat.getConversation(id));
}

export async function getMembers(): Promise<DataResult<Member[]>> {
  if (DEMO_MODE) return ok(await demoData.members());
  const api = await getServerApi();
  return unwrapList(api.workspace.members());
}

// Gateway menyimpan log sebagai { entity, entity_id, detail: object, at }.
// Tabel audit memakai bentuk datar; tanpa pemetaan ini React menerima objek
// sebagai child dan halaman gagal dirender.
type RawAuditLog = {
  id: string;
  actor_name?: string;
  action: string;
  entity?: string;
  entity_id?: string;
  target?: string;
  detail?: unknown;
  at?: string;
  created_at?: string;
};

function toAuditLogEntry(raw: RawAuditLog): AuditLogEntry {
  const target =
    raw.target ??
    [raw.entity, raw.entity_id].filter(Boolean).join(" · ") ??
    "-";
  const detail =
    typeof raw.detail === "string"
      ? raw.detail
      : raw.detail && Object.keys(raw.detail).length > 0
        ? JSON.stringify(raw.detail)
        : "-";
  return {
    id: raw.id,
    actor_name: raw.actor_name ?? "Sistem",
    action: raw.action,
    target: target || "-",
    detail,
    created_at: raw.created_at ?? raw.at ?? "",
  };
}

export async function getAuditLogs(): Promise<DataResult<AuditLogEntry[]>> {
  if (DEMO_MODE) {
    const logs = await demoData.auditLogs();
    return ok((logs as unknown as RawAuditLog[]).map(toAuditLogEntry));
  }
  const api = await getServerApi();
  const result = await unwrap(api.ops.auditLogs());
  if (!result.ok) return result;
  const items = (result.data as { items?: RawAuditLog[] }).items ?? [];
  return ok(items.map(toAuditLogEntry));
}

// ---------------------------------------------------------------------------
// Domain operasional read-only: payload mengikuti bentuk gateway apa adanya.
// ---------------------------------------------------------------------------

export async function getInventory(): Promise<DataResult<unknown>> {
  if (DEMO_MODE) return ok(await demoData.inventory());
  const api = await getServerApi();
  return unwrap(api.ops.inventory());
}

export async function getPricing(): Promise<DataResult<unknown>> {
  if (DEMO_MODE) return ok(await demoData.pricing());
  const api = await getServerApi();
  return unwrap(api.ops.pricing());
}

export async function getPurchasing(): Promise<DataResult<unknown>> {
  if (DEMO_MODE) return ok(await demoData.purchasing());
  const api = await getServerApi();
  return unwrap(api.ops.purchasing());
}

export async function getReports(): Promise<DataResult<unknown>> {
  if (DEMO_MODE) return ok(await demoData.reports());
  const api = await getServerApi();
  return unwrap(api.ops.reports());
}

export async function getIntegrations(): Promise<DataResult<unknown>> {
  if (DEMO_MODE) return ok(await demoData.integrations());
  const api = await getServerApi();
  return unwrap(api.ops.integrations());
}

export async function getTasks(): Promise<DataResult<unknown>> {
  if (DEMO_MODE) return ok(await demoData.tasks());
  const api = await getServerApi();
  return unwrap(api.ops.tasks());
}

export async function getTracking(): Promise<DataResult<unknown>> {
  if (DEMO_MODE) return ok({ items: await demoData.tracking() });
  const api = await getServerApi();
  const result = await unwrap(api.ops.tracking());
  if (!result.ok) return result;
  return ok({ items: result.data ?? [] } as unknown);
}

export async function getMonitor(storeId?: string): Promise<DataResult<unknown>> {
  if (DEMO_MODE) return ok(await demoData.monitor());
  const api = await getServerApi();
  return unwrap(api.ops.monitor(storeId ? { store_id: storeId } : undefined));
}

export async function getTraces(): Promise<DataResult<unknown>> {
  if (DEMO_MODE) return ok(await demoData.traces());
  const api = await getServerApi();
  return unwrap(api.ops.traces());
}

export async function getTrace(id: string): Promise<DataResult<unknown>> {
  if (DEMO_MODE) {
    const detail = await demoData.traceDetail(id);
    return detail ? ok(detail) : notFound("Trace tidak ditemukan", "trace");
  }
  const api = await getServerApi();
  return unwrap(api.ops.trace(id));
}

export async function getEvalsOverview(): Promise<DataResult<unknown>> {
  if (DEMO_MODE) return ok(await demoData.evals());
  const api = await getServerApi();
  return unwrap(api.ops.evalsOverview());
}

export async function getBenchmarks(): Promise<DataResult<unknown>> {
  if (DEMO_MODE) return ok(await demoData.benchmarks());
  const api = await getServerApi();
  return unwrap(api.ops.benchmarks());
}
