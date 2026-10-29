"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { CameraFrame } from "@/components/camera-frame";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface Camera {
  id: string;
  name: string;
  zone: string;
  status: "online" | "offline";
  fps: number;
}

interface Labels {
  online: string;
  offline: string;
  live: string;
  close: string;
  prev: string;
  next: string;
  fps: string;
  zone: string;
  preview: string;
}

export function CamerasGrid({
  cameras,
  labels,
}: {
  cameras: Camera[];
  labels: Labels;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Focus management: save focus on open, focus close button, restore on close.
  useEffect(() => {
    if (selected === null) {
      const prev = prevFocusRef.current;
      prevFocusRef.current = null;
      prev?.focus?.();
      return;
    }
    prevFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtnRef.current?.focus();
  }, [selected]);

  // Lock body scroll while the modal is open (same pattern as monitor-wall).
  useEffect(() => {
    if (selected === null) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [selected]);

  const close = useCallback(() => setSelected(null), []);

  const prev = useCallback(() => {
    setSelected((i) => (i === null ? null : (i - 1 + cameras.length) % cameras.length));
  }, [cameras.length]);

  const next = useCallback(() => {
    setSelected((i) => (i === null ? null : (i + 1) % cameras.length));
  }, [cameras.length]);

  useEffect(() => {
    if (selected === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [selected, close, prev, next]);

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

  const active = selected !== null ? cameras[selected] : null;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {cameras.map((camera, idx) => (
          <button
            key={camera.id}
            type="button"
            onClick={() => setSelected(idx)}
            className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={`${camera.zone} · ${camera.name} - ${labels.preview}`}
            aria-haspopup="dialog"
          >
            <Card className="overflow-hidden transition-colors hover:border-border-strong">
              <CardContent className="p-0">
                <CameraFrame camera={camera} labels={labels} className="rounded-t-lg">
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <span className="rounded-full bg-background/95 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-sm ring-1 ring-border">
                      {labels.preview}
                    </span>
                  </span>
                </CameraFrame>
                <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{camera.zone}</p>
                    <p className="tabular truncate text-xs text-muted-foreground">{`CAM-${String(idx + 1).padStart(2, "0")}`} · {camera.fps} {labels.fps}</p>
                  </div>
                  <Badge variant={camera.status === "online" ? "success" : "outline"}>
                    {camera.status === "online" ? labels.online : labels.offline}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {active ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 backdrop-blur-sm"
          onClick={close}
          onKeyDown={handleModalTab}
          role="dialog"
          aria-modal="true"
          aria-label={active.name}
        >
          <div
            ref={modalRef}
            className="relative mx-4 w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{active.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {active.zone} · {active.id} · {active.fps} {labels.fps}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={active.status === "online" ? "success" : "outline"}>
                  {active.status === "online" ? labels.online : labels.offline}
                </Badge>
                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={close}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={labels.close}
                >
                  ✕
                </button>
              </div>
            </div>

            <CameraFrame camera={active} labels={labels} />

            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
              <button
                type="button"
                onClick={prev}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                ‹ {labels.prev}
              </button>
              <span className="text-[11px] text-muted-foreground">
                {selected! + 1} / {cameras.length}
              </span>
              <button
                type="button"
                onClick={next}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {labels.next} ›
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
