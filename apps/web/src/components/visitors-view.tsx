"use client";

import { useCallback, useEffect, useState, Fragment } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight } from "@/components/icons";
import { formatClock, formatDwell, formatTimestamp } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

interface ZoneEntry {
  zone: string;
  at: string;
  dwell: number;
}

interface Visitor {
  id: string;
  entered_at: string;
  dwell_seconds: number;
  zone: string;
  status: "in_store" | "checked_out";
  zone_log?: ZoneEntry[];
}

interface Labels {
  visitorId: string;
  entered: string;
  zone: string;
  dwell: string;
  status: string;
  inStore: string;
  checkedOut: string;
  close: string;
  detail: string;
  prev: string;
  next: string;
  zoneLogTitle: string;
  zoneLogEmpty: string;
  totalDwell: string;
  lastZone: string;
}

export function VisitorsView({
  visitors,
  labels,
}: {
  visitors: Visitor[];
  labels: Labels;
}) {
  const { locale } = useI18n();
  const [selected, setSelected] = useState<number | null>(null);

  const close = useCallback(() => setSelected(null), []);

  useEffect(() => {
    if (selected === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [selected, close]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="px-0 pb-0 pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">{labels.visitorId}</th>
                  <th className="px-3 py-3 font-medium">{labels.entered}</th>
                  <th className="px-3 py-3 font-medium">{labels.lastZone}</th>
                  <th className="px-3 py-3 text-right font-medium">{labels.dwell}</th>
                  <th className="px-5 py-3 text-right font-medium">{labels.status}</th>
                  <th className="px-5 py-3 text-right font-medium">{labels.detail}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visitors.map((visitor, idx) => (
                  <Fragment key={visitor.id}>
                    <tr
                      className={cn(
                        "transition-colors hover:bg-muted/60",
                        selected === idx && "bg-muted/40",
                      )}
                    >
                      <td className="tabular px-5 py-3 font-medium text-foreground">{visitor.id}</td>
                      <td className="tabular px-3 py-3 text-muted-foreground">{formatTimestamp(visitor.entered_at, locale)}</td>
                      <td className="px-3 py-3 text-foreground">{visitor.zone}</td>
                      <td className="tabular px-3 py-3 text-right text-foreground">{formatDwell(visitor.dwell_seconds)}</td>
                      <td className="px-5 py-3 text-right">
                        <Badge variant={visitor.status === "in_store" ? "success" : "outline"}>
                          {visitor.status === "in_store" ? labels.inStore : labels.checkedOut}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelected(selected === idx ? null : idx)}
                          aria-expanded={selected === idx}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <ChevronRight
                            className={cn(
                              "size-3 transition-transform",
                              selected === idx && "rotate-90",
                            )}
                          />
                          {selected === idx ? labels.close : labels.detail}
                        </button>
                      </td>
                    </tr>
                    {selected === idx ? (
                      <tr className="bg-muted/50">
                        <td colSpan={6} className="border-l-2 border-l-accent p-0">
                          <div className="px-5 py-3">
                            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <p className="text-xs font-semibold text-foreground">
                                {labels.zoneLogTitle} · {visitor.id}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {labels.lastZone}: <span className="text-foreground">{visitor.zone}</span>
                                <span className="mx-2 text-border-strong">|</span>
                                {labels.totalDwell}: <span className="tabular text-foreground">{formatDwell(visitor.dwell_seconds)}</span>
                              </p>
                            </div>
                            {visitor.zone_log && visitor.zone_log.length > 0 ? (
                              <ol className="grid gap-2 sm:grid-cols-2">
                                {visitor.zone_log.map((entry) => (
                                  <li
                                    key={`${visitor.id}-${entry.at}-${entry.zone}`}
                                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="tabular text-[11px] text-muted-foreground">{formatClock(entry.at, locale)}</span>
                                      <span className="text-sm font-medium text-foreground">{entry.zone}</span>
                                    </div>
                                    <span className="tabular text-xs text-muted-foreground">{formatDwell(entry.dwell)}</span>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className="text-xs text-muted-foreground">{labels.zoneLogEmpty}</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
