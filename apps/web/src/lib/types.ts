import type { Problem, Role } from "@shelfops/api-client";

export type AppRole = Role | "owner";

export interface UiProblem {
  title: string;
  detail?: string;
  status: number;
  traceId?: string;
  retryable?: boolean;
}

export type DataResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: UiProblem };

export function isUiProblem(value: unknown): value is UiProblem {
  return (
    typeof value === "object" &&
    value !== null &&
    "title" in value &&
    "status" in value
  );
}

export function problemToUi(problem: Problem): UiProblem {
  return {
    title: problem.title,
    detail: problem.detail,
    status: problem.status,
    traceId: problem.trace_id || undefined,
    retryable: problem.status === 429 || problem.status >= 500,
  };
}

export function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "owner";
}

/**
 * @deprecated Gunakan can(role, "alert.update") dari @/lib/permissions.
 * Dipertahankan hanya agar import lama tidak pecah; sekarang meniru matriks.
 */
export function canUpdateAlerts(role: string | null | undefined) {
  return role === "admin" || role === "owner";
}

export interface DetectionResultDetection {
  id: string;
  bbox: [number, number, number, number];
  confidence: number;
  label: string;
  row_index: number;
  source: "model" | "manual";
}

export type DetectionResultIssueType =
  | "oos"
  | "price_mismatch"
  | "gap"
  | "low_confidence";

export interface DetectionResultIssue {
  id: string;
  type: DetectionResultIssueType;
  label: string;
  row_index: number;
  severity: "low" | "medium" | "high";
  facings?: number;
  confidence?: number;
  price_actual_idr?: number;
  price_expected_idr?: number;
}

export interface DetectionResult {
  session_id: string;
  planogram_name: string;
  image: {
    id: string;
    url: string;
    width: number;
    height: number;
  };
  score: number;
  metrics: {
    facing_total: number;
    oos_count: number;
    price_mismatch: number;
    facing_gap: number;
    price_read: number;
  };
  breakdown: {
    availability: number;
    share_adherence: number;
    price_accuracy: number;
  };
  detections: DetectionResultDetection[];
  issues: DetectionResultIssue[];
}

export interface AuditLogEntry {
  id: string;
  actor_name: string;
  action: string;
  label?: string;
  target: string;
  detail: string;
  created_at: string;
}

export interface ChatStreamEvent {
  type:
    | "token"
    | "citation"
    | "tool_start"
    | "tool_end"
    | "confirm_required"
    | "done"
    | "error";
  message_id?: string;
  text?: string;
  citation?: import("@shelfops/api-client").Citation;
  tool_call?: import("@shelfops/api-client").ToolCall;
  step?: number;
  usage?: {
    tokens_in?: number;
    tokens_out?: number;
    cost_usd?: number;
    latency_ms?: number;
    provider?: string;
    model?: string;
  };
  error?: Problem;
}
