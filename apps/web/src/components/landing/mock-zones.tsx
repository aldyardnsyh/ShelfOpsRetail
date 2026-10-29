"use client";

import { seededRandom, useLiveMockTick } from "@/hooks/use-live-mock";
import monitorFixture from "../../../fixtures/monitor.json";

type Zone = { id: string; name: string; footfall: number; dwell_seconds: number; share: number };

const ZONES = monitorFixture.zones as Zone[];
const MAX_FOOTFALL = Math.max(...ZONES.map((zone) => zone.footfall));

function formatDwell(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

/**
 * Mock kunjungan per zona: angka footfall dari fixture monitor.json berdetik
 * pelan, bar porsi digambar dari angka share fixture, bukan dekorasi karangan.
 */
export function MockZones({ dwellLabel }: { dwellLabel: string }) {
  const tick = useLiveMockTick(5000);

  return (
    <div className="landing-lift overflow-hidden rounded-2xl border border-border bg-background shadow-[0_1px_2px_rgba(24,24,27,0.06),0_12px_32px_-14px_rgba(24,24,27,0.14)]">
      <div className="divide-y divide-border">
        {ZONES.map((zone, index) => {
          const jitter = Math.round(seededRandom(tick + index + 3) * 3);
          const footfall = zone.footfall + (tick % 2 === 0 ? jitter : 0);
          const width = Math.max((zone.footfall / MAX_FOOTFALL) * 100, 6);
          return (
            <div key={zone.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-foreground">
                    {zone.name}
                  </span>
                  <span className="landing-num text-2xl font-semibold tracking-tight text-foreground">
                    {footfall}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="h-1.5 flex-1 rounded-full bg-zinc-100" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-zinc-900"
                      style={{ width: `${width}%` }}
                    />
                  </span>
                  <span className="landing-num w-28 shrink-0 text-right text-[11px] text-muted-foreground">
                    {dwellLabel} {formatDwell(zone.dwell_seconds)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
