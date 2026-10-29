"use client";

import { KpiStrip } from "@/components/ui/kpi-strip";
import { seededRandom, useLiveMockTick } from "@/hooks/use-live-mock";
import monitorFixture from "../../../fixtures/monitor.json";

type Zone = { id: string; name: string; footfall: number; share: number };

const ZONES = monitorFixture.zones as Zone[];
const BASE_FOOTFALL = monitorFixture.footfall_today as number;
const BASE_VISITORS = monitorFixture.visitors_now as number;
const EMPTY_FACINGS = monitorFixture.empty_facings as number;
const CAMERAS_ONLINE = monitorFixture.cameras_online as number;
const CAMERAS_TOTAL = monitorFixture.cameras_total as number;
const STORE_NAME = monitorFixture.store as string;

/**
 * Mock dashboard hidup untuk hero: angka dari fixture monitor.json yang
 * berdetik pelan lewat use-live-mock. Bukan ilustrasi; ini susunan komponen
 * app yang sama (KpiStrip) ditambah baris ledger zona dengan bar porsi.
 */
export function HeroMock({
  labels,
}: {
  labels: {
    live: string;
    demo: string;
    footfall: string;
    visitorsNow: string;
    emptyFacings: string;
    camerasOnline: string;
    zone: string;
    people: string;
    share: string;
  };
}) {
  const tick = useLiveMockTick(4000);
  const footfall = BASE_FOOTFALL + (tick % 7);
  const visitorsNow =
    BASE_VISITORS - 2 + Math.round(seededRandom(tick + 1) * 4);

  return (
    <div className="landing-lift overflow-hidden rounded-2xl border border-border bg-background shadow-[0_1px_2px_rgba(24,24,27,0.06),0_12px_32px_-14px_rgba(24,24,27,0.14)]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success-soft-border bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success-strong">
            <span
              className="size-1.5 rounded-full bg-success motion-safe:animate-pulse"
              aria-hidden="true"
            />
            {labels.live}
          </span>
          <span className="truncate text-xs font-medium text-foreground">
            {STORE_NAME}
          </span>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {labels.demo}
        </span>
      </div>

      <div className="p-4 sm:p-5">
        <KpiStrip
          items={[
            { label: labels.footfall, value: String(footfall) },
            { label: labels.visitorsNow, value: String(visitorsNow) },
            {
              label: labels.emptyFacings,
              value: String(EMPTY_FACINGS),
              tone: "warning",
            },
            {
              label: labels.camerasOnline,
              value: `${CAMERAS_ONLINE}/${CAMERAS_TOTAL}`,
              tone: "success",
            },
          ]}
        />

        <table className="mt-4 w-full border-collapse text-sm">
          <caption className="sr-only">{labels.zone}</caption>
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                {labels.zone}
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                {labels.people}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {labels.share}
              </th>
            </tr>
          </thead>
          <tbody>
            {ZONES.map((zone) => (
              <tr key={zone.id} className="landing-ledger-row">
                <td className="py-2 pr-3 text-foreground">{zone.name}</td>
                <td className="landing-num py-2 pr-3 text-right font-semibold text-foreground">
                  {zone.footfall}
                </td>
                <td className="py-2 text-right">
                  <span className="landing-num inline-flex min-w-9 justify-end text-xs text-muted-foreground">
                    {zone.share}%
                  </span>
                  <span
                    className="ml-2 hidden h-1.5 w-16 rounded-full bg-zinc-100 align-middle sm:inline-block"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-zinc-900"
                      style={{ width: `${Math.min(zone.share * 2.4, 100)}%` }}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
