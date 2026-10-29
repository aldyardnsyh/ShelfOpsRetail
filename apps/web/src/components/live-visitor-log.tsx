"use client";

import { useEffect, useRef, useState } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { seededRandom } from "@/hooks/use-live-mock";

interface LogLine {
  key: string;
  time: string;
  visitor: string;
  zone: string;
  event: "masuk" | "pindah" | "keluar";
}

const MOCK_ZONES = ["Entrance", "Rak Dapur", "Chiller", "Kasir"];
const MAX_LINES = 60;

function clock(at: Date) {
  return at.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Log aktivitas pengunjung yang benar-benar mengalir: mulai kosong, lalu satu
 * baris masuk setiap 1,2 sampai 2,6 detik. Tidak ada riwayat statis dari
 * fixture, karena yang diilustrasikan adalah feed langsung.
 */
export function LiveVisitorLog({
  labels,
}: {
  labels: { title: string; subtitle: string; empty: string };
}) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const seqRef = useRef(0);
  const visitorRef = useRef("P-001");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      const seq = seqRef.current;
      const delay = seq === 0 ? 400 : 1200 + Math.floor(seededRandom(seq * 13 + 7) * 1400);

      timer = setTimeout(() => {
        if (cancelled) return;
        if (!document.hidden) {
          const r1 = seededRandom(seq * 7 + 13);
          const r2 = seededRandom(seq * 7 + 91);
          const r3 = seededRandom(seq * 7 + 177);
          const event: LogLine["event"] =
            r3 < 0.42 ? "masuk" : r3 < 0.86 ? "pindah" : "keluar";
          const visitor =
            event === "masuk"
              ? `P-${String(1 + Math.floor(r1 * 40)).padStart(3, "0")}`
              : visitorRef.current;
          visitorRef.current = visitor;
          const line: LogLine = {
            key: `stream-${seq}`,
            time: clock(new Date()),
            visitor,
            zone: MOCK_ZONES[Math.floor(r2 * MOCK_ZONES.length)]!,
            event,
          };
          seqRef.current += 1;
          setLines((current) => [...current, line].slice(-MAX_LINES));
        }
        schedule();
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border py-2.5">
        <div>
          <h2 className="text-xs font-semibold tracking-tight text-foreground">{labels.title}</h2>
          <p className="text-[11px] text-muted-foreground">{labels.subtitle}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success-strong">
          <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden="true" />
          LIVE
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <div
          ref={scrollRef}
          className="h-48 overflow-y-auto bg-surface-subtle px-3 py-2 font-mono text-[11px] leading-5"
          aria-live="polite"
          aria-label={labels.title}
        >
          {lines.map((line) => (
            <div key={line.key} className="flex gap-2 whitespace-nowrap">
              <span className="tabular text-muted-foreground">{line.time}</span>
              <span className="font-medium text-foreground">{line.visitor}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">{line.zone}</span>
              <span className="text-muted-foreground">{line.event}</span>
            </div>
          ))}
          {lines.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-muted-foreground">{labels.empty}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}