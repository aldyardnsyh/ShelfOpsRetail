import createClient, { type Client } from "openapi-fetch";

import type { components, paths } from "./schema.js";

export type Schemas = components["schemas"];
export type Problem = Schemas["Problem"];
export type Role = Schemas["Role"];
export type MeResponse = Schemas["MeResponse"];
export type Workspace = Schemas["Workspace"];
export type WorkspaceUpdate = Schemas["WorkspaceUpdate"];
export type MemberCreate = Schemas["MemberCreate"];
export type MemberRoleUpdate = Schemas["MemberRoleUpdate"];
export type DocumentCreate = Schemas["DocumentCreate"];
export type AuditCreate = Schemas["AuditCreate"];
export type SendMessageRequest = Schemas["SendMessageRequest"];
export type Store = Schemas["Store"];
export type Kpis = Schemas["Kpis"];
export type TrendPoint = Schemas["TrendPoint"];
export type StoreRank = Schemas["StoreRank"];
export type Alert = Schemas["Alert"];
export type Document = Schemas["Document"];
export type DocumentPage = Schemas["DocumentPage"];
export type AuditSession = Schemas["AuditSession"];
export type AuditDetail = Schemas["AuditDetail"];
export type AuditImage = Schemas["AuditImage"];
export type Detection = Schemas["Detection"];
export type AuditMetrics = Schemas["AuditMetrics"];
export type Conversation = Schemas["Conversation"];
export type ConversationDetail = Schemas["ConversationDetail"];
export type ChatMessage = Schemas["ChatMessage"];
export type ChatEvent = Schemas["ChatEvent"];
export type Citation = Schemas["Citation"];
export type ToolCall = Schemas["ToolCall"];
export type Member = Schemas["Member"];
export type UploadSlot = Schemas["UploadSlot"];
export type JobEvent = Schemas["JobEvent"];
export type Health = Schemas["Health"];

export type AlertStatus = NonNullable<Schemas["Alert"]["status"]>;
export type AlertType = NonNullable<Schemas["Alert"]["type"]>;
export type AlertSeverity = NonNullable<Schemas["Alert"]["severity"]>;

export interface ShelfopsClientOptions {
  baseUrl?: string;
  headers?: HeadersInit;
  fetch?: typeof globalThis.fetch;
}

export interface ApiErrorShape {
  problem: Problem;
  status: number;
}

export class ApiError extends Error implements ApiErrorShape {
  readonly problem: Problem;
  readonly status: number;

  constructor(problem: Problem, status: number) {
    super(problem.detail ?? problem.title);
    this.name = "ApiError";
    this.problem = problem;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isProblem(value: unknown): value is Problem {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.status === "number"
  );
}

export function problemFrom(error: unknown, response?: Response): Problem {
  if (isProblem(error)) {
    return {
      ...error,
      trace_id:
        error.trace_id ||
        response?.headers.get("x-trace-id") ||
        response?.headers.get("x-request-id") ||
        "",
    };
  }

  const status = response?.status ?? 500;
  const detail =
    isRecord(error) && typeof error.detail === "string"
      ? error.detail
      : isRecord(error) && typeof error.message === "string"
        ? error.message
        : undefined;

  return {
    type: "about:blank",
    title: status >= 500 ? "Server sedang bermasalah" : "Permintaan tidak dapat diproses",
    status,
    detail,
    instance: response?.url,
    trace_id:
      response?.headers.get("x-trace-id") ??
      response?.headers.get("x-request-id") ??
      "",
  };
}

export function apiErrorFrom(error: unknown, response?: Response): ApiError {
  const problem = problemFrom(error, response);
  return new ApiError(problem, response?.status ?? problem.status);
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function createShelfopsClient(options: ShelfopsClientOptions = {}) {
  const baseUrl =
    options.baseUrl ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8080";

  const raw: Client<paths> = createClient<paths>({
    baseUrl,
    credentials: "include",
    headers: options.headers,
    fetch: options.fetch,
  });

  const url = (path: string) => joinUrl(baseUrl, path);

  const permissive = raw as unknown as {
    GET: <T>(
      path: string,
      init?: Record<string, unknown>,
    ) => Promise<{ data?: T; error?: unknown; response: Response }>;
    POST: <T>(
      path: string,
      init?: Record<string, unknown>,
    ) => Promise<{ data?: T; error?: unknown; response: Response }>;
  };

  const auth = {
    login: (body: Schemas["LoginRequest"]) =>
      raw.POST("/api/v1/auth/login", { body }),
    startDemo: () => raw.POST("/api/v1/auth/demo"),
    refresh: () => raw.POST("/api/v1/auth/refresh"),
    logout: () => raw.POST("/api/v1/auth/logout"),
    me: () => raw.GET("/api/v1/me"),
  };

  const workspace = {
    get: () => raw.GET("/api/v1/workspace"),
    update: (body: Schemas["WorkspaceUpdate"]) =>
      raw.PATCH("/api/v1/workspace", { body }),
    members: () => raw.GET("/api/v1/workspace/members"),
    addMember: (body: Schemas["MemberCreate"]) =>
      raw.POST("/api/v1/workspace/members", { body }),
    updateMemberRole: (id: string, body: Schemas["MemberRoleUpdate"]) =>
      raw.PATCH("/api/v1/workspace/members/{id}", {
        params: { path: { id } },
        body,
      }),
    removeMember: (id: string) =>
      raw.DELETE("/api/v1/workspace/members/{id}", {
        params: { path: { id } },
      }),
  };

  const stores = {
    list: (query?: { region?: string; q?: string }) =>
      raw.GET("/api/v1/stores", { params: { query } }),
    create: (body: Schemas["StoreCreate"]) =>
      raw.POST("/api/v1/stores", { body }),
    planograms: () => raw.GET("/api/v1/planograms"),
    createPlanogram: (body: Schemas["PlanogramCreate"]) =>
      raw.POST("/api/v1/planograms", { body }),
  };

  const insights = {
    kpis: (query?: { from?: string; to?: string; region?: string; category?: string }) =>
      raw.GET("/api/v1/insights/kpis", { params: { query } }),
    trend: (query?: {
      from?: string;
      to?: string;
      region?: string;
      granularity?: "day" | "week";
    }) => raw.GET("/api/v1/insights/trend", { params: { query } }),
    ranking: (query?: {
      from?: string;
      to?: string;
      region?: string;
      limit?: number;
    }) => raw.GET("/api/v1/insights/ranking", { params: { query } }),
  };

  const alerts = {
    list: (query?: {
      status?: AlertStatus;
      severity?: AlertSeverity;
      store_id?: string;
      limit?: number;
    }) => raw.GET("/api/v1/alerts", { params: { query } }),
    update: (id: string, status: AlertStatus) =>
      raw.PATCH("/api/v1/alerts/{id}", {
        params: { path: { id } },
        body: { status },
      }),
  };

  const documents = {
    uploadUrl: (body: Schemas["DocumentUploadUrlRequest"]) =>
      raw.POST("/api/v1/documents/upload-url", { body }),
    create: (body: Schemas["DocumentCreate"], idempotencyKey?: string) =>
      raw.POST("/api/v1/documents", {
        body,
        params: {
          header: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
        },
      }),
    list: (query?: {
      cursor?: string;
      limit?: number;
      status?: Schemas["Document"]["status"];
    }) => raw.GET("/api/v1/documents", { params: { query } }),
    get: (id: string) =>
      raw.GET("/api/v1/documents/{id}", { params: { path: { id } } }),
    remove: (id: string) =>
      raw.DELETE("/api/v1/documents/{id}", { params: { path: { id } } }),
    reindex: (id: string, idempotencyKey?: string) =>
      raw.POST("/api/v1/documents/{id}/reindex", {
        params: {
          path: { id },
          header: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
        },
      }),
    chunks: (
      id: string,
      query?: { q?: string; page?: number; limit?: number },
    ) =>
      raw.GET("/api/v1/documents/{id}/chunks", {
        params: { path: { id }, query },
      }),
    eventsUrl: (id: string) => url(`/api/v1/documents/${id}/events`),
  };

  const chat = {
    listConversations: (query?: { cursor?: string; limit?: number }) =>
      raw.GET("/api/v1/conversations", { params: { query } }),
    createConversation: (body: Schemas["ConversationCreate"]) =>
      raw.POST("/api/v1/conversations", { body }),
    getConversation: (id: string) =>
      raw.GET("/api/v1/conversations/{id}", { params: { path: { id } } }),
    renameConversation: (id: string, title: string) =>
      raw.PATCH("/api/v1/conversations/{id}", {
        params: { path: { id } },
        body: { title },
      }),
    deleteConversation: (id: string) =>
      raw.DELETE("/api/v1/conversations/{id}", { params: { path: { id } } }),
    sendMessage: (
      id: string,
      body: Schemas["SendMessageRequest"],
      idempotencyKey?: string,
    ) =>
      raw.POST("/api/v1/conversations/{id}/messages", {
        params: {
          path: { id },
          header: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
        },
        body,
      }),
    messagesUrl: (id: string) => url(`/api/v1/conversations/${id}/messages`),
    exportUrl: (id: string) => url(`/api/v1/conversations/${id}/export`),
    feedback: (messageId: string, body: Schemas["FeedbackRequest"]) =>
      raw.POST("/api/v1/messages/{id}/feedback", {
        params: { path: { id: messageId } },
        body,
      }),
    confirmToolCall: (id: string, decision: "confirm" | "reject") =>
      raw.POST("/api/v1/tool-calls/{id}/confirm", {
        params: { path: { id } },
        body: { decision },
      }),
  };

  const audit = {
    list: (query?: {
      store_id?: string;
      from?: string;
      to?: string;
      min_score?: number;
      cursor?: string;
      limit?: number;
    }) => raw.GET("/api/v1/audits", { params: { query } }),
    create: (body: Schemas["AuditCreate"]) =>
      raw.POST("/api/v1/audits", { body }),
    get: (id: string) =>
      raw.GET("/api/v1/audits/{id}", { params: { path: { id } } }),
    uploadUrls: (id: string, body: Schemas["AuditImagesUploadRequest"]) =>
      raw.POST("/api/v1/audits/{id}/images/upload-urls", {
        params: { path: { id } },
        body,
      }),
    start: (id: string, idempotencyKey?: string) =>
      raw.POST("/api/v1/audits/{id}/start", {
        params: {
          path: { id },
          header: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
        },
      }),
    eventsUrl: (id: string) => url(`/api/v1/audits/${id}/events`),
    recompute: (id: string) =>
      raw.POST("/api/v1/audits/{id}/recompute", { params: { path: { id } } }),
    report: (id: string) =>
      permissive.GET<Schemas["AuditReport"]>(`/api/v1/audits/${id}/report`),
    finalize: (id: string) =>
      permissive.POST<Schemas["AuditSession"]>(`/api/v1/audits/${id}/finalize`),
    exportUrl: (id: string, format: "pdf" | "csv") =>
      url(`/api/v1/audits/${id}/export?format=${format}`),
    updateDetection: (id: string, body: Schemas["DetectionPatch"]) =>
      raw.PATCH("/api/v1/detections/{id}", {
        params: { path: { id } },
        body,
      }),
    deleteDetection: (id: string) =>
      raw.DELETE("/api/v1/detections/{id}", { params: { path: { id } } }),
    createDetection: (id: string, body: Schemas["DetectionCreate"]) =>
      raw.POST("/api/v1/audits/{id}/detections", {
        params: { path: { id } },
        body,
      }),
    imageUrl: (id: string) => url(`/api/v1/images/${id}/content`),
  };

  const health = {
    healthz: () => raw.GET("/healthz"),
    readyz: () => raw.GET("/readyz"),
  };

  const system = {
    quota: () => raw.GET("/api/v1/system/quota"),
  };

  // Domain operasional read-only (endpoint composite besar). Schemas["OpsOverview"]
  // dibaca sebagai "any record" karena respons belum ditulis ke openapi.yaml.
  type OpsAny = Record<string, unknown>;
  const ops = {
    inventory: () => permissive.GET<OpsAny>("/api/v1/inventory"),
    pricing: () => permissive.GET<OpsAny>("/api/v1/pricing"),
    tasks: (query?: { limit?: number }) =>
      permissive.GET<OpsAny>("/api/v1/tasks", { params: { query } }),
    purchasing: () => permissive.GET<OpsAny>("/api/v1/purchasing"),
    tracking: (query?: { limit?: number }) =>
      permissive.GET<OpsAny>("/api/v1/tracking", { params: { query } }),
    monitor: (query?: { store_id?: string }) =>
      permissive.GET<OpsAny>("/api/v1/monitor", { params: { query } }),
    reports: () => permissive.GET<OpsAny>("/api/v1/reports"),
    integrations: () => permissive.GET<OpsAny>("/api/v1/integrations"),
    benchmarks: () => permissive.GET<OpsAny>("/api/v1/benchmarks"),
    evalsOverview: () => permissive.GET<OpsAny>("/api/v1/evals/overview"),
    traces: (query?: { limit?: number }) =>
      permissive.GET<OpsAny>("/api/v1/traces", { params: { query } }),
    trace: (requestId: string) =>
      permissive.GET<OpsAny>(`/api/v1/traces/${requestId}`),
    auditLogs: (query?: { action?: string; limit?: number }) =>
      permissive.GET<OpsAny>("/api/v1/audit", { params: { query } }),
  };

  return {
    raw,
    baseUrl,
    auth,
    workspace,
    stores,
    insights,
    alerts,
    documents,
    chat,
    audit,
    health,
    system,
    ops,
  };
}

export type ShelfopsClient = ReturnType<typeof createShelfopsClient>;
