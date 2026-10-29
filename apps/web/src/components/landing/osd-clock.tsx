"use client";

import { useLiveMockTick } from "@/hooks/use-live-mock";
import { cn } from "@/lib/utils";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/**
 * OSD kamera: timestamp mono berdetik (tick 1s) + tag zona opsional.
 * Render "--:--:--" sampai tick pertama agar SSR/ klient deterministik.
 */
export function OsdClock({
  zone,
  className,
}: {
  zone?: string;
  className?: string;
}) {
  useLiveMockTick(1000);
  const now = new Date();
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-zinc-400",
        className,
      )}
    >
      {zone ? (
        <span className="rounded border border-zinc-700 px-1 py-px text-zinc-300">
          {zone}
        </span>
      ) : null}
      <span suppressHydrationWarning>{time}</span>
    </span>
  );
}
