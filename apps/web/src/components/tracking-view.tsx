"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { CheckCircle, ChevronDown, MapPin, Search, Truck, Warning } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DEMO_MODE } from "@/lib/demo";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export interface ShipmentTimelineStep {
  at?: string;
  time?: string;
  label_key?: string;
  label?: string;
  location?: string;
  done: boolean;
}

export interface Shipment {
  id: string;
  po_id: string;
  po_code?: string;
  supplier_name: string;
  origin: string;
  destination: string;
  carrier: string;
  tracking_no: string;
  eta: string;
  status: string;
  progress_pct: number;
  timeline: ShipmentTimelineStep[];
  last_update: string;
  items_summary: string;
  temp_ok: boolean;
}

type BadgeVariant = "neutral" | "accent" | "warning" | "success" | "danger";

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  in_transit: "accent",
  at_hub: "warning",
  out_for_delivery: "accent",
  delivered: "success",
  delayed: "danger",
};

export function TrackingView({
  shipments,
  labels,
}: {
  shipments: Shipment[];
  labels: {
    search: string;
    searchPlaceholder: string;
    allStatuses: string;
    statuses: Record<string, string>;
    timelineSteps: Record<string, string>;
    carrier: string;
    destination: string;
    eta: string;
    progress: string;
    shipment: string;
    poRef: string;
    items: string;
    lastUpdate: string;
    coldChain: string;
    tempOk: string;
    tempWarning: string;
    timeline: string;
    emptyFilteredTitle: string;
    emptyFilteredBody: string;
    resetFilter: string;
  };
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  // Pelacakan demo berjalan sendiri: progres naik sedikit tiap 1,8 detik
  // selama baris terbuka, sehingga truk terlihat bergerak di jalur.
  const [liveProgress, setLiveProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!DEMO_MODE || !expanded) return;
    const shipment = shipments.find((item) => item.id === expanded);
    if (!shipment) return;
    setLiveProgress((prev) => ({
      ...prev,
      [expanded]: prev[expanded] ?? shipment.progress_pct,
    }));
    const timer = setInterval(() => {
      setLiveProgress((prev) => {
        const current = prev[expanded] ?? shipment.progress_pct;
        const next = Math.min(99, Math.round((current + 0.8) * 10) / 10);
        return next === current ? prev : { ...prev, [expanded]: next };
      });
    }, 1800);
    return () => clearInterval(timer);
  }, [expanded, shipments]);

  const needle = query.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      shipments.filter((item) => {
        const matchesStatus = !status || item.status === status;
        const matchesQuery =
          !needle ||
          item.tracking_no.toLowerCase().includes(needle) ||
          item.supplier_name.toLowerCase().includes(needle) ||
          item.destination.toLowerCase().includes(needle) ||
          item.id.toLowerCase().includes(needle) ||
          (item.po_code ?? "").toLowerCase().includes(needle);
        return matchesStatus && matchesQuery;
      }),
    [shipments, status, needle],
  );

  const hasFilter = needle !== "" || status !== "";

  function resetFilters() {
    setQuery("");
    setStatus("");
    setExpanded(null);
  }

  function fmtDate(iso: string) {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full space-y-1.5 sm:max-w-xs">
          <Label htmlFor="shipment-search">{labels.search}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="shipment-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchPlaceholder}
              className="pl-8"
            />
          </div>
        </div>
        <div className="w-full space-y-1.5 sm:max-w-48">
          <Label htmlFor="shipment-status">Status</Label>
          <select
            id="shipment-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
          >
            <option value="">{labels.allStatuses}</option>
            {Object.entries(labels.statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <Table aria-label={t.tracking.title}>
          <TableHeader>
            <TableRow>
              <TableHead>{labels.shipment}</TableHead>
              <TableHead className="hidden md:table-cell">{labels.destination}</TableHead>
              <TableHead className="hidden lg:table-cell">{labels.carrier}</TableHead>
              <TableHead className="hidden whitespace-nowrap lg:table-cell">{labels.eta}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">{labels.progress}</TableHead>

              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => {
              const openRow = expanded === item.id;
              const currentStep = item.timeline.find((step) => !step.done);
              const progress = liveProgress[item.id] ?? item.progress_pct;
              return (
                <Fragment key={item.id}>
                  <TableRow className="hover:bg-muted/60">
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setExpanded(openRow ? null : item.id)}
                        aria-expanded={openRow}
                        className="group flex items-start gap-2 text-left"
                      >
                        <ChevronDown
                          className={cn(
                            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                            openRow && "rotate-180",
                          )}
                        />
                        <span>
                          <span className="tabular block text-sm font-medium text-foreground">{item.tracking_no}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {item.supplier_name} · {item.po_code ?? item.po_id}
                          </span>
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="hidden max-w-[15rem] truncate text-sm text-muted-foreground md:table-cell" title={item.destination}>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" />
                        {item.destination}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      <span className="inline-flex items-center gap-1.5">
                        <Truck className="size-3.5 shrink-0" />
                        {item.carrier}
                      </span>
                    </TableCell>
                    <TableCell className="tabular hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                      {fmtDate(item.eta)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" role="presentation">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              item.status === "delayed"
                                ? "bg-danger"
                                : item.status === "delivered"
                                  ? "bg-success"
                                  : "bg-accent",
                            )}
                            style={{ width: `${item.progress_pct}%` }}
                          />
                        </div>
                        <span className="tabular w-9 text-right text-xs text-muted-foreground">
                          {item.progress_pct}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={STATUS_VARIANT[item.status] ?? "neutral"}>
                        {labels.statuses[item.status] ?? item.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  {openRow ? (
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={6} className="align-top">
                        <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[11px] sm:grid-cols-4">
                          <div>
                            <dt className="text-muted-foreground">{labels.items}</dt>
                            <dd className="text-foreground">{item.items_summary}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">{labels.carrier}</dt>
                            <dd className="text-foreground">{item.carrier}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">{labels.lastUpdate}</dt>
                            <dd className="tabular text-foreground">{fmtDate(item.last_update)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">{labels.coldChain}</dt>
                            <dd className={item.temp_ok ? "text-success-strong" : "text-danger-strong"}>
                              {item.temp_ok ? labels.tempOk : labels.tempWarning}
                            </dd>
                          </div>
                        </dl>
                        <div className="mb-4">
                          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                            <span className="min-w-0 truncate">{item.origin}</span>
                            <span className="min-w-0 truncate text-right">{item.destination}</span>
                          </div>
                          <div className="relative mt-2 h-1.5 rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full transition-[width] duration-700",
                                item.status === "delayed"
                                  ? "bg-danger"
                                  : item.status === "delivered"
                                    ? "bg-success"
                                    : "bg-accent",
                              )}
                              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                            />
                            <span
                              aria-hidden="true"
                              className={cn(
                                "absolute -top-[7px] flex size-5 items-center justify-center rounded-full border border-border bg-background text-accent-strong shadow-sm transition-[left] duration-700",
                                item.status !== "delivered" && "motion-safe:animate-pulse",
                              )}
                              style={{ left: `calc(${Math.min(100, Math.max(0, progress))}% - 10px)` }}
                            >
                              <Truck className="size-3" />
                            </span>
                          </div>
                        </div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {labels.timeline}
                        </p>
                        <ol className="relative mt-3 ml-3 space-y-4 border-l border-border pl-5">
                          {item.timeline.map((step, index) => {
                            const isCurrent = currentStep === step;
                            return (
                              <li key={`${step.label_key ?? step.label ?? "step"}-${index}`} className="relative">
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    "absolute -left-[26.5px] top-0.5 flex size-[18px] items-center justify-center rounded-full border-2 border-background",
                                    step.done
                                      ? "bg-accent text-accent-foreground"
                                      : isCurrent
                                        ? "bg-warning-soft text-warning-strong motion-safe:animate-pulse"
                                        : "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {isCurrent ? (
                                    <span className="absolute inset-0 rounded-full bg-warning/40 motion-safe:animate-ping" aria-hidden="true" />
                                  ) : null}
                                  {step.done ? <CheckCircle className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
                                </span>
                                <p className={cn("text-sm", step.done || isCurrent ? "font-medium text-foreground" : "text-muted-foreground")}>
                                  {step.label ?? labels.timelineSteps[step.label_key ?? ""] ?? step.label_key ?? "Langkah"}
                                </p>
                                <p className="tabular text-[11px] text-muted-foreground">
                                  {[step.location, fmtDate(step.at ?? step.time ?? "")].filter(Boolean).join(" · ")}
                                </p>
                              </li>
                            );
                          })}
                        </ol>
                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                          <span>
                            {labels.items}: <span className="font-medium text-foreground">{item.items_summary}</span>
                          </span>
                          <span>
                            {labels.lastUpdate}: <span className="tabular font-medium text-foreground">{fmtDate(item.last_update)}</span>
                          </span>
                          {item.status !== "delivered" ? (
                            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5", item.temp_ok ? "border-success-soft-border bg-success-soft text-success-strong" : "border-warning-soft-border bg-warning-soft text-warning-strong")}>
                              {item.temp_ok ? <CheckCircle className="size-3.5" /> : <Warning className="size-3.5" />}
                              {labels.coldChain}: {item.temp_ok ? labels.tempOk : labels.tempWarning}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {labels.emptyFilteredTitle}. {labels.emptyFilteredBody}
            </p>
            {hasFilter ? (
              <Button type="button" variant="secondary" size="sm" onClick={resetFilters}>
                {labels.resetFilter}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
