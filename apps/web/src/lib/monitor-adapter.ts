import type {
  MonitorData,
  OperationsData,
} from "@/components/monitor-dashboard";

/**
 * Bentuk payload `/api/v1/monitor` dari gateway. Ditulis manual karena endpoint
 * ini belum masuk skema OpenAPI (lihat docs/BACKLOG.md).
 */
export interface MonitorPayload {
  store?: string;
  store_id?: string;
  visitors_now?: number;
  footfall_today?: number;
  footfall_delta?: number;
  avg_dwell_seconds?: number;
  dwell_delta?: number;
  empty_facings?: number;
  queue_seconds?: number;
  cameras_online?: number;
  cameras_total?: number;
  hourly?: { hour: number; visitors: number }[];
  hourly_dwell?: { hour: number; dwell_seconds: number }[];
  zones?: { id: string; name: string; footfall: number; dwell_seconds: number; share: number }[];
  cameras?: { id: string; name: string; zone: string; status: string; fps: number }[];
  visitors?: {
    id: string;
    entered_at: string;
    dwell_seconds: number;
    zone: string;
    status: string;
  }[];
}

export interface InventoryPayload {
  summary?: {
    low_stock_count?: number;
    out_of_stock_count?: number;
    stock_value_idr?: number;
    task_open?: number;
    task_in_progress?: number;
    task_overdue?: number;
  };
  balances?: {
    sku: string;
    product_name: string;
    store_name: string;
    available: number;
    reorder_point: number;
    low?: boolean;
  }[];
  tasks?: {
    id: string;
    title: string;
    store_name?: string | null;
    severity?: string;
    status?: string;
    due_at?: string | null;
  }[];
}

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function asSeverity(value?: string): "high" | "medium" | "low" {
  if (value === "high" || value === "critical") return "high";
  if (value === "low") return "low";
  return "medium";
}

function asTaskStatus(value?: string): "open" | "in_progress" | "done" {
  if (value === "in_progress") return "in_progress";
  if (value === "done") return "done";
  return "open";
}

/** Menormalkan payload `/monitor` menjadi bentuk yang dipakai MonitorDashboard. */
export function toMonitorData(payload: MonitorPayload): MonitorData {
  const cameras = (payload.cameras ?? []).map((camera) => ({
    id: camera.id,
    name: camera.name,
    zone: camera.zone,
    status: camera.status === "online" ? ("online" as const) : ("offline" as const),
    fps: camera.fps ?? 0,
  }));

  return {
    store: payload.store ?? "Toko demo",
    visitors_now: payload.visitors_now ?? 0,
    footfall_today: payload.footfall_today ?? 0,
    footfall_delta: payload.footfall_delta ?? 0,
    avg_dwell_seconds: payload.avg_dwell_seconds ?? 0,
    dwell_delta: payload.dwell_delta ?? 0,
    empty_facings: payload.empty_facings ?? 0,
    queue_seconds: payload.queue_seconds ?? 0,
    cameras_online:
      payload.cameras_online ?? cameras.filter((camera) => camera.status === "online").length,
    cameras_total: payload.cameras_total ?? cameras.length,
    hourly: (payload.hourly ?? []).map((point) => ({
      hour: hourLabel(point.hour),
      visitors: point.visitors,
    })),
    hourly_dwell: (payload.hourly_dwell ?? []).map((point) => point.dwell_seconds),
    zones: payload.zones ?? [],
    cameras,
    visitors: (payload.visitors ?? []).map((visitor, index) => ({
      // ID panjang (UUID) sulit dilacak di layar; nomor urut stabil per
      // pemuatan lebih mudah disebut saat operasi toko.
      id: `P-${String(index + 1).padStart(3, "0")}`,
      entered_at: visitor.entered_at,
      dwell_seconds: visitor.dwell_seconds,
      zone: visitor.zone,
      status: visitor.status === "in_store" ? ("in_store" as const) : ("checked_out" as const),
    })),
  };
}

/** Ringkasan operasional untuk panel stok/tugas di dashboard. */
export function toOperationsData(payload: InventoryPayload): OperationsData {
  const summary = payload.summary ?? {};
  const tasks = (payload.tasks ?? [])
    .filter((task) => task.status !== "done")
    .sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""))
    .slice(0, 5)
    .map((task) => ({
      id: task.id,
      title: task.title,
      store_name: task.store_name ?? "-",
      severity: asSeverity(task.severity),
      status: asTaskStatus(task.status),
      due_at: task.due_at ?? new Date().toISOString(),
    }));

  const lowStock = (payload.balances ?? [])
    .filter((balance) => balance.available > 0 && balance.available <= balance.reorder_point)
    .sort(
      (a, b) =>
        a.available / Math.max(1, a.reorder_point) -
        b.available / Math.max(1, b.reorder_point),
    )
    .slice(0, 6)
    .map((balance) => ({
      sku: balance.sku,
      product_name: balance.product_name,
      store_name: balance.store_name,
      available: balance.available,
      reorder_point: balance.reorder_point,
    }));

  return {
    low_stock_count: summary.low_stock_count ?? 0,
    out_of_stock_count: summary.out_of_stock_count ?? 0,
    stock_value_idr: summary.stock_value_idr ?? 0,
    task_open: summary.task_open ?? 0,
    task_in_progress: summary.task_in_progress ?? 0,
    task_overdue: summary.task_overdue ?? 0,
    tasks,
    lowStock,
  };
}
