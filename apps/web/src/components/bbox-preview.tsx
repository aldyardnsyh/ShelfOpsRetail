"use client";

import type { AuditImage, Detection } from "@shelfops/api-client";
import { useMemo, useState } from "react";

import { ImageIcon, Warning } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

// Slot ilustrasi rak demo: 3 baris x 7 kolom. Koordinat dalam rasio 0..1 agar
// cocok dengan SVG 1600x900. Slot 3, 10, 17 kosong dan ditandai bbox merah.
const DEMO_EMPTY = new Set([3, 10, 17]);
const DEMO_SLOTS = Array.from({ length: 21 }, (_, index) => {
  const col = index % 7;
  const row = Math.floor(index / 7);
  return {
    x: (70 + col * 210) / 1600,
    y: (170 + row * 240) / 900,
    w: 170 / 1600,
    h: 166 / 900,
    empty: DEMO_EMPTY.has(index),
  };
});

const BBOX_COLORS = [
  "var(--color-bbox-1)",
  "var(--color-bbox-2)",
  "var(--color-bbox-3)",
  "var(--color-bbox-4)",
  "var(--color-bbox-5)",
  "var(--color-bbox-6)",
];

export function BboxPreview({
  images,
  detectionsByImage,
  demoMode,
}: {
  images: AuditImage[];
  detectionsByImage: Record<string, Detection[]>;
  demoMode: boolean;
}) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const [showBoxes, setShowBoxes] = useState(true);
  const [zoom, setZoom] = useState(100);

  const activeImage = images[activeIndex];
  const detections = activeImage ? (detectionsByImage[activeImage.id] ?? []) : [];
  const boxes = useMemo(
    () =>
      demoMode
        ? DEMO_SLOTS.map((slot, index) => ({
            id: `demo-slot-${index}`,
            bbox: [slot.x, slot.y, slot.x + slot.w, slot.y + slot.h] as number[],
            label: slot.empty ? "Kosong" : "Facing",
            confidence: 0.9,
            source: "model" as const,
          }))
        : detections.map((detection) => ({
            id: detection.id,
            bbox: detection.bbox,
            label: detection.label ?? "Tanpa label",
            confidence: detection.confidence,
            source: detection.source,
          })),
    [demoMode, detections],
  );
  const labels = useMemo(
    () => [...new Set(boxes.map((box) => box.label))].slice(0, BBOX_COLORS.length),
    [boxes],
  );
  const colorByLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const [index, label] of labels.entries()) {
      map.set(label, BBOX_COLORS[index % BBOX_COLORS.length]!);
    }
    map.set("Kosong", "var(--color-danger)");
    return map;
  }, [labels]);

  if (!activeImage) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-subtle p-6 text-center">
        <ImageIcon className="mx-auto size-5 text-foreground" />
        <p className="mt-2 text-sm font-medium text-foreground">
          {t.sessions.imageUnavailable}
        </p>
        <p className="mt-1 text-sm text-foreground">
          {t.sessions.imageUnavailableBody}
        </p>
      </div>
    );
  }

  const failed = activeImage.status === "failed";
  // Di mode demo URL API tidak tersedia; pakai ilustrasi rak sebagai bukti foto.
  const imageSrc = demoMode
    ? "/fixtures/shelf-grid.svg"
    : activeImage.url;
  const width = activeImage.width;
  const height = activeImage.height;

  return (
    <div className="space-y-3">
      {images.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.sessions.imagesTitle}>
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-pressed={index === activeIndex}
              className={cn(
                "h-8 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                index === activeIndex
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:bg-surface-subtle",
              )}
            >
              {t.sessions.images} {index + 1}
              {image.status === "failed" ? " (!)" : ""}
            </button>
          ))}
        </div>
      ) : null}

      {failed ? (
        <div className="rounded-lg border border-danger-soft-border bg-danger-soft p-4" role="alert">
          <div className="flex items-start gap-2">
            <Warning className="mt-0.5 size-4 shrink-0 text-danger-strong" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-danger-strong">
                {t.sessions.failedImage}
              </p>
              <p className="text-sm text-foreground/80">
                {activeImage.error ?? t.sessions.failedImageBody}
              </p>
            </div>
          </div>
        </div>
      ) : imageSrc ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                id="show-bboxes"
                type="checkbox"
                checked={showBoxes}
                onChange={(event) => setShowBoxes(event.target.checked)}
                className="size-4 rounded border-border accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
              <Label htmlFor="show-bboxes">{t.sessions.showBbox}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="bbox-zoom" className="text-foreground">
                {t.sessions.bboxWidth}
              </Label>
              <select
                id="bbox-zoom"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
              >
                <option value={100}>100%</option>
                <option value={150}>150%</option>
                <option value={200}>200%</option>
              </select>
            </div>
          </div>

          <div className="overflow-auto rounded-lg border border-border bg-muted">
            <div className="relative" style={{ width: `${zoom}%` }}>
              <img
                src={imageSrc}
                alt={`${t.sessions.bboxPreview} ${activeIndex + 1}`}
                width={demoMode ? 1600 : (width ?? 1600)}
                height={demoMode ? 900 : (height ?? 900)}
                className="block h-auto w-full select-none"
              />
              {showBoxes && width && height
                ? boxes.map((detection, index) => {
                    const [x1, y1, x2, y2] = detection.bbox;
                    if (
                      x1 === undefined ||
                      y1 === undefined ||
                      x2 === undefined ||
                      y2 === undefined
                    ) {
                      return null;
                    }
                    const label = detection.label ?? "Tanpa label";
                    const color =
                      colorByLabel.get(label) ?? BBOX_COLORS[index % BBOX_COLORS.length];
                    return (
                      <span
                        key={detection.id}
                        title={`${detection.label ?? "?"} ${Math.round(detection.confidence * 100)}%`}
                        className="pointer-events-none absolute border-[2.5px]"
                        style={{
                          left: `${(x1 / width) * 100}%`,
                          top: `${(y1 / height) * 100}%`,
                          width: `${((x2 - x1) / width) * 100}%`,
                          height: `${((y2 - y1) / height) * 100}%`,
                          borderColor: color,
                          borderStyle: detection.source === "manual" ? "dashed" : "solid",
                        }}
                      />
                    );
                  })
                : null}
              {demoMode ? (
                <span className="absolute bottom-2 left-2 rounded bg-background/95 px-1.5 py-0.5 text-[10px] text-foreground">
                  {t.sessions.demoIllustration}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {labels.map((label, index) => (
              <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-foreground">
                <span
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: BBOX_COLORS[index % BBOX_COLORS.length] }}
                  aria-hidden="true"
                />
                {label}
              </span>
            ))}
            {detections.some((detection) => detection.source === "manual") ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground">
                <span className="h-2 w-3 border border-dashed border-muted-foreground" aria-hidden="true" />
                {t.status.source.manual}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-surface-subtle p-6 text-center">
          <ImageIcon className="mx-auto size-5 text-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">
            {t.sessions.imageUnavailable}
          </p>
          <p className="mt-1 text-sm text-foreground">
            {t.sessions.imageUnavailableBody}
          </p>
        </div>
      )}

      {!failed ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-foreground">
          <Badge variant="outline">
            {detections.length} {t.sessions.detectionsNoun}
          </Badge>
          {width && height ? (
            <span className="font-mono">
              {width} x {height}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
