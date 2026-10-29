"use client";

import { useEffect, useState } from "react";

import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface FeedCamera {
  id: string;
  name: string;
  zone: string;
  status: "online" | "offline";
  fps: number;
}

export interface FeedLabels {
  live: string;
  offline: string;
  fps: string;
}

function FeedClock({ active }: { active: boolean }) {
  const [time, setTime] = useState("");

  useEffect(() => {
    if (!active) return;
    const tick = () => setTime(formatClock(new Date(), "id"));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;
  return <span className="tabular text-[10px] text-zinc-300">{time}</span>;
}

/**
 * Feed kamera demo memakai berkas GIF beranimasi
 * (`/fixtures/camera-feed-animated.gif`): latar rak diam, dua kotak berlabel ID
 * berpindah antar rak. Tidak ada animasi CSS, jadi gerak tetap berjalan walau
 * browser meminta reduced motion dan tidak bisa "membeku" seperti screenshot.
 */
export function CameraFrame({
  camera,
  labels,
  fill = false,
  minimal = false,
  className,
  children,
}: {
  camera: FeedCamera;
  labels: FeedLabels;
  fill?: boolean;
  minimal?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const online = camera.status === "online";

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-zinc-950",
        fill ? "h-full w-full" : "aspect-video",
        className,
      )}
      aria-hidden="true"
    >
      <img
        src="/fixtures/camera-feed-animated.gif"
        alt=""
        aria-hidden="true"
        className={cn(
          "absolute inset-0 h-full w-full object-cover",
          online ? "opacity-100" : "opacity-40 grayscale",
        )}
      />

      {minimal ? null : (
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent 0 2px, #ffffff 2px 3px)",
          }}
        />
      )}

      <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-1.5">
        <span className="min-w-0 truncate rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-zinc-100 ring-1 ring-white/10">
          {camera.name}
        </span>
        {online ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-success-soft/95 px-1.5 py-0.5 text-[10px] font-medium text-success-strong">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            {labels.live}
          </span>
        ) : (
          <span className="shrink-0 rounded bg-warning-soft/95 px-1.5 py-0.5 text-[10px] font-medium text-warning-strong">
            {labels.offline}
          </span>
        )}
      </div>

      {children}

      {minimal ? null : (
        <span className="absolute bottom-2 left-2 max-w-[55%] truncate rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-zinc-100 ring-1 ring-white/10">
          {camera.zone}
        </span>
      )}

      {minimal ? null : (
        <span className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded bg-black/55 px-1.5 py-0.5 ring-1 ring-white/10">
          <span className="tabular text-[10px] text-zinc-300">
            {camera.fps} {labels.fps}
          </span>
          <FeedClock active={online} />
        </span>
      )}
    </div>
  );
}