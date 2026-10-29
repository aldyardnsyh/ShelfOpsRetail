"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { CameraFrame } from "@/components/camera-frame";
import { ArrowLeft } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatClock, formatDwell } from "@/lib/format";
import { seededRandom, useLiveMockTick } from "@/hooks/use-live-mock";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

export interface MonitorWallData {
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
  zones: { id: string; name: string; footfall: number; dwell_seconds: number; share: number }[];
  cameras: { id: string; name: string; zone: string; status: "online" | "offline"; fps: number }[];
  visitors: { id: string; entered_at: string; dwell_seconds: number; zone: string; status: "in_store" | "checked_out"; zone_log?: { zone: string; at: string; dwell: number }[] }[];
}

export interface MonitorWallLabels {
  title: string;
  subtitle: string;
  exit: string;
  layout: string;
  layout2x2: string;
  layout3x3: string;
  fullscreen: string;
  exitFullscreen: string;
  online: string;
  offline: string;
  visitors: string;
  visits: string;
  checkedOut: string;
  dwell: string;
  zone: string;
  fps: string;
  live: string;
  demo: string;
  cameras: string;
  alertsTitle: string;
  visitorsTitle: string;
  zonesTitle: string;
  time: string;
  page: string;
  autoCycle: string;
  autoCycleOn: string;
  prev: string;
  next: string;
  lowStockRack: string;
  queueRegister: string;
  visitorsToday: string;
  othersPrefix: string;
  seeAll: string;
}

type Layout = "2x2" | "3x3";

function CameraTile({
  camera,
  labels,
  onClick,
  zoneStats,
}: {
  camera: MonitorWallData["cameras"][number];
  labels: MonitorWallLabels;
  onClick?: () => void;
  zoneStats?: { footfall: number; dwell_seconds: number };
}) {
  const online = camera.status === "online";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md border bg-background text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        online ? "border-border" : "border-warning/40",
      )}
    >
      <CameraFrame camera={camera} labels={labels} fill className="flex-1">
        {zoneStats ? (
          <span className="absolute left-2 top-8 inline-flex items-center gap-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] tabular text-zinc-100 ring-1 ring-white/10">
            <span className="text-zinc-400">{labels.visits}</span>
            <span className="font-medium">{zoneStats.footfall}</span>
            <span className="text-zinc-400">·</span>
            <span className="font-medium">{formatDwell(zoneStats.dwell_seconds)}</span>
          </span>
        ) : null}
      </CameraFrame>
      <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-1.5">
        <span className="truncate text-[11px] font-medium text-foreground" title={camera.name}>
          {camera.name}
        </span>
        <Badge variant={online ? "success" : "outline"} className="shrink-0 text-[10px]">
          {online ? labels.online : labels.offline}
        </Badge>
      </div>
    </button>
  );
}

export function MonitorWall({
  data,
  labels,
}: {
  data: MonitorWallData;
  labels: MonitorWallLabels;
}) {
  const [layout, setLayout] = useState<Layout>("2x2");
  const [page, setPage] = useState(0);
  const [selectedCam, setSelectedCam] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  // ID gateway berupa UUID; di layar monitor dipakai nomor urut P-### agar
  // bisa disebut saat operasi toko.
  const visitorLabels = useMemo(
    () =>
      new Map(
        data.visitors.map((visitor, index) => [
          visitor.id,
          `P-${String(index + 1).padStart(3, "0")}`,
        ]),
      ),
    [data.visitors],
  );

  // Focus management: save focus on open, focus close button, restore on close.
  useEffect(() => {
    if (selectedCam === null) {
      const prev = prevFocusRef.current;
      prevFocusRef.current = null;
      prev?.focus?.();
      return;
    }
    prevFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtnRef.current?.focus();
  }, [selectedCam]);

  useEffect(() => {
    if (selectedCam === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedCam(null);
      else if (e.key === "ArrowLeft")
        setSelectedCam((i) => (i === null ? null : (i - 1 + data.cameras.length) % data.cameras.length));
      else if (e.key === "ArrowRight")
        setSelectedCam((i) => (i === null ? null : (i + 1) % data.cameras.length));
    };
    window.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedCam, data.cameras.length]);
  const [autoCycle, setAutoCycle] = useState(true);
  const [now, setNow] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const pageSize = layout === "2x2" ? 4 : 9;
  const totalPages = Math.max(1, Math.ceil(data.cameras.length / pageSize));

  useEffect(() => {
    setPage((p) => (p >= totalPages ? 0 : p));
  }, [totalPages]);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(formatClock(d, "id"));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    if (!autoCycle || selectedCam !== null || totalPages <= 1) return;
    const id = setInterval(() => {
      setPage((p) => (p + 1) % totalPages);
    }, 8000);
    return () => clearInterval(id);
  }, [autoCycle, selectedCam, totalPages]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // ignore
    }
  };

  const start = page * pageSize;
  const visibleCameras = data.cameras.slice(start, start + pageSize);

  function handleModalTab(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const modal = modalRef.current;
    if (!modal) return;
    const focusables = Array.from(
      modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const WALL_ZONE_PALETTE = [
  "var(--color-bbox-1)",
  "var(--color-bbox-2)",
  "var(--color-bbox-3)",
  "var(--color-bbox-4)",
];
const WALL_ZONE_BY_NAME: Record<string, string> = {
  entrance: WALL_ZONE_PALETTE[0]!,
  "rak dapur": WALL_ZONE_PALETTE[1]!,
  chiller: WALL_ZONE_PALETTE[2]!,
  kasir: WALL_ZONE_PALETTE[3]!,
};
function zoneColor(name: string) {
  const named = WALL_ZONE_BY_NAME[name.trim().toLowerCase()];
  if (named) return named;
  const hash = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return WALL_ZONE_PALETTE[hash % WALL_ZONE_PALETTE.length]!;
}

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-subtle px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Button asChild variant="tertiary" size="sm">
            <Link href="/cameras">
              <ArrowLeft />
              {labels.exit}
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-success" aria-hidden="true" />
            <h1 className="text-sm font-semibold tracking-tight text-foreground">
              {labels.title}
            </h1>
            <span className="text-xs text-muted-foreground">· {data.store}</span>
          </div>

        </div>

        <div className="flex items-center gap-3">
          <span className="tabular text-xs font-medium text-foreground" suppressHydrationWarning>{now}</span>
          <span className="text-[11px] text-muted-foreground">{labels.time}</span>
          <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
            {(["2x2", "3x3"] as Layout[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLayout(l)}
                aria-pressed={layout === l}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  layout === l
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l === "2x2" ? labels.layout2x2 : labels.layout3x3}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => (p - 1 + totalPages) % totalPages)}
              disabled={totalPages <= 1}
              className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={labels.prev}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => (p + 1) % totalPages)}
              disabled={totalPages <= 1}
              className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={labels.next}
            >
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={() => setAutoCycle((v) => !v)}
            aria-pressed={autoCycle}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              autoCycle
                ? "border-accent bg-accent-soft text-accent-strong"
                : "border-border bg-background text-foreground hover:bg-muted",
            )}
          >
            {autoCycle ? labels.autoCycleOn : labels.autoCycle}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {isFullscreen ? labels.exitFullscreen : labels.fullscreen}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded bg-surface-subtle px-2 py-0.5">
          <span className="size-1.5 rounded-full bg-success" />
          {data.cameras_online}/{data.cameras_total} {labels.cameras.toLowerCase()}
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-surface-subtle px-2 py-0.5">
          {data.visitors_now} {labels.visitors.toLowerCase()}
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-surface-subtle px-2 py-0.5">
          {labels.page} {page + 1}/{totalPages}
        </span>
        <span className="text-muted-foreground">{labels.subtitle}</span>
      </div>

      {/* main */}
      <div className="flex flex-1 gap-3 overflow-hidden px-3 pb-3">
        {/* camera grid */}
        <div className="flex-1">
          <div
            className={cn(
              "grid h-full gap-3",
              layout === "2x2" ? "grid-cols-2 grid-rows-2" : "grid-cols-3 grid-rows-3",
            )}
          >
            {visibleCameras.map((c, idx) => (
              <CameraTile
                key={c.id}
                camera={c}
                labels={labels}
                onClick={() => setSelectedCam(data.cameras.indexOf(c))}
                zoneStats={data.zones.find((z) => z.name === c.zone)}

              />
            ))}
            {Array.from({ length: pageSize - visibleCameras.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground"
              >
                -
              </div>
            ))}
          </div>
        </div>

        {/* right rail: ultra-dense so all 3 sections fit at any viewport height */}
        <aside className="hidden w-72 shrink-0 flex-col gap-2 overflow-y-auto pr-1 lg:flex">
          <Card className="shrink-0">
            <CardHeader className="border-b border-border py-2">
              <h2 className="text-xs font-semibold tracking-tight text-foreground">
                {labels.visitorsTitle}
              </h2>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {data.visitors
                  .filter((v) => v.status === "in_store")
                  .slice(0, 2)
                  .map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between gap-2 px-3 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="tabular text-xs font-medium text-foreground">
                          {visitorLabels.get(v.id) ?? v.id}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {v.zone} · {formatClock(v.entered_at, "id")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular text-[11px] text-foreground">
                          {formatDwell(v.dwell_seconds)}
                        </p>
                        <Badge
                          variant="success"
                          className="px-1.5 py-0 text-[9px]"
                        >
                          {labels.live}
                        </Badge>
                      </div>
                    </li>
                  ))}
              </ul>
              {data.visitors.filter((v) => v.status === "in_store").length > 2 ? (
                <div className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground">
                  {labels.othersPrefix.replace(
                    "{n}",
                    String(data.visitors.filter((v) => v.status === "in_store").length - 2),
                  )}{" · "}{" "}
                  <Button asChild variant="link" size="sm" className="h-auto text-[10px]">
                    <Link href="/visitors">{labels.seeAll}</Link>
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="shrink-0">
            <CardHeader className="border-b border-border py-2">
              <h2 className="text-xs font-semibold tracking-tight text-foreground">
                {labels.zonesTitle}
              </h2>
            </CardHeader>
            <CardContent className="p-2.5">
              <ul className="space-y-1">
                {data.zones.map((z) => (
                  <li key={z.id}>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-medium text-foreground">{z.name}</span>
                      <span className="tabular text-muted-foreground">
                        {z.footfall} · {formatDwell(z.dwell_seconds)}
                      </span>
                    </div>
                    <div className="mt-0.5 h-1 w-full rounded-full bg-surface-subtle">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.round(z.share * 100)}%`, backgroundColor: zoneColor(z.name) }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="shrink-0">
            <CardHeader className="border-b border-border py-2">
              <h2 className="text-xs font-semibold tracking-tight text-foreground">
                {labels.alertsTitle}
              </h2>
            </CardHeader>
            <CardContent className="p-2.5">
              <ul className="space-y-1 text-[10px]">
                <li className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{labels.lowStockRack}</span>
                  <span className="tabular font-medium text-warning-strong">
                    {data.empty_facings}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{labels.queueRegister}</span>
                  <span className="tabular font-medium text-foreground">
                    {data.queue_seconds}s
                  </span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{labels.visitorsToday}</span>
                  <span className="tabular font-medium text-foreground">
                    {data.footfall_today}
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>

      <footer className="border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
        {labels.demo}
      </footer>

      {selectedCam !== null && data.cameras[selectedCam] ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 backdrop-blur-sm"
          onClick={() => setSelectedCam(null)}
          onKeyDown={handleModalTab}
          role="dialog"
          aria-modal="true"
          aria-label={data.cameras[selectedCam].name}
        >
          <div
            ref={modalRef}
            className="relative mx-4 w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {data.cameras[selectedCam].name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {data.cameras[selectedCam].zone} · {data.cameras[selectedCam].name} · {data.cameras[selectedCam].fps} {labels.fps}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={data.cameras[selectedCam].status === "online" ? "success" : "outline"}>
                  {data.cameras[selectedCam].status === "online" ? labels.online : labels.offline}
                </Badge>
                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={() => setSelectedCam(null)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={labels.exit}
                >
                  ✕
                </button>
              </div>
            </div>

            <CameraFrame camera={data.cameras[selectedCam]} labels={labels} />

            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
              <button
                type="button"
                onClick={() => setSelectedCam((i) => (i === null ? null : (i - 1 + data.cameras.length) % data.cameras.length))}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                ‹ {labels.prev}
              </button>
              <span className="text-[11px] text-muted-foreground">
                {selectedCam + 1} / {data.cameras.length}
              </span>
              <button
                type="button"
                onClick={() => setSelectedCam((i) => (i === null ? null : (i + 1) % data.cameras.length))}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {labels.next} ›
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
