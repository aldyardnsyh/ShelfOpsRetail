"use client";

import Link from "next/link";
import { CameraFrame } from "@/components/camera-frame";
import { formatDwell, formatTimestamp } from "@/lib/format";
import { ChevronRight } from "@/components/icons";
import { useMemo } from "react";
import {
  Cell,
  LabelList,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  PremiumAreaChart,
  PremiumBarChart,
  PremiumTooltipContent,
} from "@/components/ui/chart-kit";
import { EmptyState } from "@/components/empty-state";
import { useLiveMockTick } from "@/hooks/use-live-mock";
import { useI18n } from "@/lib/i18n/client";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

export interface MonitorData {
  store: string;
  visitors_now: number;
  footfall_today: number;
  footfall_delta: number;
  avg_dwell_seconds: number;
  dwell_delta: number;
  empty_facings: number;
  queue_seconds: number;
  cameras_online: number;
  cameras_total: number;
  hourly: { hour: string; visitors: number }[];
  hourly_dwell?: number[];
  zones: {
    id: string;
    name: string;
    footfall: number;
    dwell_seconds: number;
    share: number;
  }[];
  cameras: {
    id: string;
    name: string;
    zone: string;
    status: "online" | "offline";
    fps: number;
  }[];
  visitors: {
    id: string;
    entered_at: string;
    dwell_seconds: number;
    zone: string;
    status: "in_store" | "checked_out";
    zone_log?: { zone: string; at: string; dwell: number }[];
  }[];
}

export interface OperationsData {
  low_stock_count: number;
  out_of_stock_count: number;
  stock_value_idr: number;
  task_open: number;
  task_in_progress: number;
  task_overdue: number;
  tasks: {
    id: string;
    title: string;
    store_name: string;
    severity: "high" | "medium" | "low";
    status: "open" | "in_progress" | "done";
    due_at: string;
  }[];
  lowStock: {
    sku: string;
    product_name: string;
    store_name: string;
    available: number;
    reorder_point: number;
  }[];
}

export interface MonitorLabels {
  visitorsNow: string;
  footfall: string;
  avgDwell: string;
  emptyFacings: string;
  camerasOnline: string;
  queue: string;
  vsYesterday: string;
  hourlyTitle: string;
  hourlyBody: string;
  zonesTitle: string;
  zonesBody: string;
  zone: string;
  footfallShort: string;
  dwell: string;
  share: string;
  peak: string;
  total: string;
  avgPerHour: string;
  compositionTitle: string;
  compositionBody: string;
  activeHint: string;
  emptyHint: string;
  camerasTitle: string;
  camerasBody: string;
  online: string;
  offline: string;
  live: string;
  fps: string;
  lowStock: string;
  lowStockHint: string;
  openTasks: string;
  taskHint: string;
  overdueTasks: string;
  lowStockTitle: string;
  lowStockBody: string;
  viewInventory: string;
  reorderPoint: string;
  taskTitle: string;
  taskBody: string;
  viewTasks: string;
  taskStatuses: Record<string, string>;
  visitorsTitle: string;
  visitorsBody: string;
  visitorId: string;
  entered: string;
  status: string;
  inStore: string;
  checkedOut: string;
  viewAll: string;
  viewCameras: string;
  demo: string;
}

// Zona diberi warna per nama area, bukan per UUID, supaya area yang sama
// selalu tampil dengan warna yang sama di grafik dan legenda. Palet bbox
// dipakai karena sudah dipakai untuk bounding box di layar kamera.
const ZONE_PALETTE = [
  "var(--color-bbox-1)",
  "var(--color-bbox-2)",
  "var(--color-bbox-3)",
  "var(--color-bbox-4)",
];
const ZONE_BY_NAME: Record<string, string> = {
  entrance: ZONE_PALETTE[0]!,
  "rak dapur": ZONE_PALETTE[1]!,
  chiller: ZONE_PALETTE[2]!,
  kasir: ZONE_PALETTE[3]!,
};
const zoneColor = (id: string, name: string) => {
  const named = ZONE_BY_NAME[name.trim().toLowerCase()];
  if (named) return named;
  const hash = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return ZONE_PALETTE[hash % ZONE_PALETTE.length]!;
};

function Delta({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 tabular text-[11px] font-medium",
        positive
          ? "bg-success-soft text-success-strong"
          : "bg-danger-soft text-danger-strong",
      )}
    >
      {positive ? "▲" : "▼"}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const width = 120;
  const height = 34;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-8 w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={areaPoints} fill="var(--color-accent)" fillOpacity="0.1" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}



export function MonitorDashboard({
  data,
  ops,
  labels,
}: {
  data: MonitorData;
  ops?: OperationsData;
  labels: MonitorLabels;
}) {
  const hourly = useMemo(
    () => data.hourly.map((p) => ({ hour: p.hour, visitors: p.visitors })),
    [data.hourly],
  );

  const reduced = useReducedMotion();
  const { t, locale } = useI18n();
  // Mock realtime: KPI pengunjung/footfall naik pelan tiap 5s (client-side,
  // deterministik dari tick, berhenti saat reduced-motion).
  const liveTick = useLiveMockTick(5000);
  const liveVisitorsNow = data.visitors_now + (liveTick % 4);
  const liveFootfall = data.footfall_today + liveTick;

  const hourlyEmpty = hourly.length === 0;
  const totalVisitors = hourly.reduce((s, p) => s + p.visitors, 0);
  const peak = hourlyEmpty
    ? { hour: 0, visitors: 0 }
    : hourly.reduce((a, b) => (b.visitors > a.visitors ? b : a), hourly[0]!);
  const avgPerHour = hourlyEmpty ? 0 : Math.round(totalVisitors / hourly.length);
  const peakIndex = hourlyEmpty ? -1 : hourly.findIndex((p) => p.hour === peak.hour);

  const zoneBars = useMemo(
    () => [...data.zones].sort((a, b) => b.footfall - a.footfall),
    [data.zones],
  );

  const dwellSeries = data.hourly_dwell ?? [];
  const kpis = [
    {
      label: labels.visitorsNow,
      value: liveVisitorsNow.toString(),
      hint: labels.activeHint,
      spark: undefined as number[] | undefined,
      tone: "accent" as const,
      live: true,
    },
    {
      label: labels.footfall,
      value: liveFootfall.toLocaleString("id-ID"),
      delta: data.footfall_delta,
      spark: hourly.map((p) => p.visitors),
      tone: "accent" as const,
    },
    {
      label: labels.avgDwell,
      value: formatDwell(data.avg_dwell_seconds),
      delta: data.dwell_delta,
      spark: dwellSeries.length > 0 ? dwellSeries : undefined,
      tone: "accent" as const,
      live: false,
    },
    {
      label: labels.emptyFacings,
      value: data.empty_facings.toString(),
      hint: labels.emptyHint,
      spark: undefined as number[] | undefined,
      tone: "warning" as const,
      live: false,
    },
    ...(ops
      ? [
          {
            label: labels.lowStock,
            value: ops.low_stock_count.toLocaleString("id-ID"),
            hint: labels.lowStockHint,
            spark: undefined as number[] | undefined,
            tone: "warning" as const,
            live: false,
          },
          {
            label: labels.openTasks,
            value: (ops.task_open + ops.task_in_progress).toLocaleString("id-ID"),
            hint:
              ops.task_overdue > 0
                ? `${ops.task_overdue} ${labels.overdueTasks}`
                : labels.taskHint,
            spark: undefined as number[] | undefined,
            tone: ops.task_overdue > 0 ? ("danger" as const) : ("accent" as const),
            live: false,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      {/* KPI band */}
      <div
        className={cn(
          "grid grid-cols-2 gap-4",
          kpis.length > 4 ? "lg:grid-cols-6" : "lg:grid-cols-4",
        )}
      >
        {kpis.map((kpi, i) => (
          <div
            key={`kpi-${i}`}
            className="group relative min-w-0 overflow-hidden rounded-lg border border-border bg-background p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-h-8 text-xs font-medium leading-4 text-muted-foreground">
                {kpi.label}
                {kpi.live ? (
                  <span
                    className="ml-1.5 inline-flex size-1.5 animate-pulse rounded-full bg-success align-middle"
                    aria-hidden="true"
                  />
                ) : null}
              </p>
              {kpi.delta !== undefined ? <Delta value={kpi.delta} /> : null}
            </div>
            <p
              className={cn(
                "tabular mt-1 text-2xl font-semibold tracking-tight",
                kpi.tone === "warning"
                  ? "text-warning-strong"
                  : kpi.tone === "danger"
                    ? "text-danger-strong"
                    : "text-foreground",
              )}
            >
              {kpi.value}
            </p>
            <div className="mt-2 flex h-8 items-end justify-between gap-2">
              <div className="min-h-8 text-[11px] leading-4 text-muted-foreground">
                {kpi.hint ? <span>{kpi.hint}</span> : null}
                {kpi.delta !== undefined ? <span>{labels.vsYesterday}</span> : null}
              </div>
              {kpi.spark ? (
                <div className="w-24 shrink-0 opacity-80 transition-opacity group-hover:opacity-100">
                  <Sparkline data={kpi.spark} />
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {ops ? (
        <div className="grid items-stretch gap-4 lg:grid-cols-5">
          <Card className="flex min-w-0 flex-col lg:col-span-2">
            <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  {labels.lowStockTitle}
                </h2>
                <p className="text-xs text-muted-foreground">{labels.lowStockBody}</p>
              </div>
              <Button asChild variant="tertiary" size="sm" className="shrink-0">
                <Link href="/inventory">
                  {labels.viewInventory}
                  <ChevronRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {ops.lowStock.slice(0, 6).map((item) => (
                  <li
                    key={`${item.store_name}-${item.sku}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.product_name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {item.store_name}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-sm font-medium text-warning-strong">
                        {item.available}
                      </p>
                      <p className="tabular text-[11px] text-muted-foreground">
                        {labels.reorderPoint} {item.reorder_point}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="flex min-w-0 flex-col lg:col-span-3">
            <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  {labels.taskTitle}
                </h2>
                <p className="text-xs text-muted-foreground">{labels.taskBody}</p>
              </div>
              <Button asChild variant="tertiary" size="sm" className="shrink-0">
                <Link href="/tasks">
                  {labels.viewTasks}
                  <ChevronRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {ops.tasks.slice(0, 5).map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {task.title}
                      </p>
                      <p className="tabular truncate text-[11px] text-muted-foreground">
                        {task.id} · {task.store_name}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-[11px] text-muted-foreground">
                        {task.due_at.slice(5, 16).replace("T", " ")}
                      </span>
                      <Badge
                        variant={
                          task.status === "open"
                            ? "warning"
                            : task.status === "done"
                              ? "success"
                              : "accent"
                        }
                      >
                        {labels.taskStatuses[task.status]}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* main charts */}
      <div className="grid items-stretch gap-4 lg:grid-cols-5">
        <Card className="min-w-0 overflow-hidden lg:col-span-3">
          <CardHeader className="border-b border-border">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {labels.hourlyTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{labels.hourlyBody}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {!hourlyEmpty ? (
                <>
                  <span>
                    {labels.peak} <span className="font-medium text-foreground">{peak.hour}:00</span>
                  </span>
                  <span>
                    {labels.total} <span className="tabular font-medium text-foreground">{totalVisitors}</span>
                  </span>
                  <span>
                    {labels.avgPerHour}{" "}
                    <span className="tabular font-medium text-foreground">{avgPerHour}</span>
                  </span>
                </>
              ) : null}
              <span>
                {labels.queue}{" "}
                <span className="tabular font-medium text-foreground">{formatDwell(data.queue_seconds)}</span>
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {hourlyEmpty ? (
              <EmptyState title={t.states.emptyTitle} body={t.states.emptyBody} />
            ) : (
            <PremiumAreaChart
              data={hourly}
              xKey="hour"
              yKey="visitors"
              seriesName={t.monitorWall.suffixVisitors}
              height={256}
              ariaLabel={labels.hourlyTitle}
              margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
              yAxisWidth={40}
              xTickFormatter={(value) => `${value}`}
            >
              <ReferenceLine
                y={avgPerHour}
                stroke="var(--color-accent)"
                strokeDasharray="2 4"
                strokeOpacity={0.45}
                label={{
                  value: `${t.chart.average} ${avgPerHour}`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "var(--color-muted-foreground)",
                }}
              />
              <Line
                type="monotone"
                dataKey="visitors"
                stroke="transparent"
                dot={(props) => {
                  const { cx, cy, index } = props as {
                    cx: number;
                    cy: number;
                    index: number;
                  };
                  if (cx == null || cy == null || index !== peakIndex) return null;
                  return (
                    <g key={`d-${index}`}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill="var(--color-accent)"
                        stroke="var(--color-background)"
                        strokeWidth={2}
                      />
                    </g>
                  );
                }}
                isAnimationActive={false}
              />
            </PremiumAreaChart>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden lg:col-span-2">
          <CardHeader className="border-b border-border">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {labels.zonesTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{labels.zonesBody}</p>
          </CardHeader>
          <CardContent className="pt-4">
            <PremiumBarChart
              data={zoneBars}
              xKey="name"
              yKeys={["footfall"]}
              layout="vertical"
              height={256}
              ariaLabel={labels.zonesTitle}
              margin={{ top: 4, right: 36, left: 4, bottom: 4 }}
              axisWidth={64}
              barColor={(entry) => zoneColor(String(entry.id), String(entry.name ?? ""))}
              showStats={false}
              xAxisOverrides={{
                label: {
                  value: t.monitorWall.axisLabel,
                  position: "insideBottomRight",
                  offset: -2,
                  fontSize: 10,
                  fill: "var(--color-muted-foreground)",
                },
              }}
            >
              <LabelList
                dataKey="footfall"
                position="right"
                fill="var(--color-foreground)"
                fontSize={11}
                fontWeight={600}
              />
            </PremiumBarChart>
            <p className="mt-3 mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t.monitorWall.avgDurationZone}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              {zoneBars.map((zone, i) => (
                <div key={zone.id} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: zoneColor(zone.id, zone.name) }}
                    />
                    <span className="truncate">{zone.name}</span>
                  </span>
                  <span className="tabular shrink-0 text-foreground">{formatDwell(zone.dwell_seconds)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* cameras + composition */}
      <div className="grid items-stretch gap-4 lg:grid-cols-5">
        <Card className="min-w-0 overflow-hidden lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {labels.camerasTitle}
              </h2>
              <p className="text-sm text-muted-foreground">{labels.camerasBody}</p>
            </div>
            <Button asChild variant="tertiary" size="sm" className="shrink-0">
              <Link href="/cameras">
                {labels.viewCameras}
                <ChevronRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {data.cameras.map((camera) => (
                <Link
                  key={camera.id}
                  href="/cameras"
                  aria-label={camera.name}
                  className="group overflow-hidden rounded-lg border border-border bg-background transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <CameraFrame camera={camera} labels={labels} minimal className="h-20">
                    <span className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-zinc-300 opacity-70 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      ↗
                    </span>
                  </CameraFrame>
                  <div className="flex items-center justify-between gap-1 border-t border-border px-2.5 py-1.5">
                    <span className="truncate text-[11px] text-muted-foreground">{camera.zone}</span>
                    <span className="tabular text-[11px] text-foreground">{camera.fps} fps</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden lg:col-span-2">
          <CardHeader className="border-b border-border">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {labels.compositionTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{labels.compositionBody}</p>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="h-40 w-40 shrink-0 self-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={zoneBars}
                      dataKey="share"
                      nameKey="name"
                      innerRadius={42}
                      outerRadius={64}
                      paddingAngle={2}
                      isAnimationActive={!reduced}
                      animationDuration={450}
                      stroke="var(--color-background)"
                      strokeWidth={2}
                    >
                      {zoneBars.map((zone) => (
                        <Cell key={zone.id} fill={zoneColor(zone.id, zone.name)} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={
                        <PremiumTooltipContent
                          valueFormatter={(value) => `${value}%`}
                        />
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full min-w-0 flex-1 space-y-2">
                {zoneBars.map((zone) => (
                  <li key={zone.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: zoneColor(zone.id, zone.name) }}
                      />
                      <span className="truncate">{zone.name}</span>
                    </span>
                    <span className="tabular font-medium text-foreground">{Math.round(zone.share * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* recent visitors */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {labels.visitorsTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{labels.visitorsBody}</p>
          </div>
          <Button asChild variant="tertiary" size="sm" className="shrink-0">
            <Link href="/visitors">
              {labels.viewAll}
              <ChevronRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">{labels.visitorId}</th>
                  <th className="px-3 py-2.5 font-medium">{labels.entered}</th>
                  <th className="px-3 py-2.5 font-medium">{labels.zone}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{labels.dwell}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{labels.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.visitors.map((visitor) => (
                  <tr key={visitor.id} className="transition-colors hover:bg-surface-subtle">
                    <td className="tabular px-5 py-2.5 font-medium text-foreground">{visitor.id}</td>
                    <td className="tabular px-3 py-2.5 text-muted-foreground">{formatTimestamp(visitor.entered_at, locale)}</td>
                    <td className="px-3 py-2.5 text-foreground">{visitor.zone}</td>
                    <td className="tabular px-3 py-2.5 text-right text-foreground">
                      {formatDwell(visitor.dwell_seconds)}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Badge variant={visitor.status === "in_store" ? "success" : "outline"}>
                        {visitor.status === "in_store" ? labels.inStore : labels.checkedOut}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
