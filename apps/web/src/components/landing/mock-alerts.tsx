"use client";

import { useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import alertsFixture from "../../../fixtures/alerts.json";

type FixtureAlert = {
  id: string;
  store_name: string;
  type: string;
  severity: string;
  status: string;
  detail: string;
};

const ALERTS = (alertsFixture as FixtureAlert[])
  .filter((alert) => alert.type === "oos")
  .slice(0, 3);

/**
 * Mock antrean peringatan untuk fitur "Peringatan menjadi tugas":
 * tombol Selesaikan benar-benar mengubah status baris (state lokal),
 * mengikuti pola tabel peringatan di app. Data dari fixture alerts.json.
 */
export function MockAlerts({ resolveLabel }: { resolveLabel: string }) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const resolve = (id: string) => {
    setResolvedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <div className="landing-lift overflow-hidden rounded-2xl border border-border bg-background shadow-[0_1px_2px_rgba(24,24,27,0.06),0_12px_32px_-14px_rgba(24,24,27,0.14)]">
      <div className="divide-y divide-border">
        {ALERTS.map((alert) => {
          const resolved = resolvedIds.has(alert.id);
          return (
            <div key={alert.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="alertType" value={alert.type} />
                  <span className="truncate text-sm font-medium text-foreground">
                    {alert.store_name}
                  </span>
                  {resolved ? <StatusBadge kind="alert" value="resolved" /> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {alert.detail}
                </p>
              </div>
              {resolved ? null : (
                <button
                  type="button"
                  onClick={() => resolve(alert.id)}
                  className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {resolveLabel}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
