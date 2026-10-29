"use client";

import { Fragment, useMemo, useState } from "react";

import { ChevronDown, ChevronUp, Download, Plus } from "@/components/icons";
import { PremiumAreaChart } from "@/components/ui/chart-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDelta, formatNumber, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export interface ReportMetrics {
  visitors: number;
  availability_pct: number;
  oos_rate_pct: number;
  price_mismatch: number;
  tasks_open: number;
  stock_value_idr: number;
}

export interface ReportRow {
  id: string;
  title: string;
  kind: "daily" | "weekly" | "monthly";
  period_from: string;
  period_to: string;
  scope: string;
  stores_count: number;
  status: "ready" | "scheduled" | "failed";
  generated_at: string;
  format: string;
  metrics: ReportMetrics;
}

export interface ScheduleRow {
  id: string;
  name: string;
  cadence: string;
  scope: string;
  format: string;
  recipients: string | string[];
  active: boolean;
}

export interface SeriesPoint {
  date: string;
  availability_pct: number;
  oos_rate_pct: number;
  visitors: number;
}

const STATUS_VARIANT = {
  ready: "success",
  scheduled: "accent",
  failed: "danger",
} as const;

export function ReportsView({
  reports: initialReports,
  schedules,
  series,
  baseMetrics,
  labels,
}: {
  reports: ReportRow[];
  schedules: ScheduleRow[];
  series: SeriesPoint[];
  baseMetrics: ReportMetrics;
  labels: {
    tabReports: string;
    tabSchedules: string;
    search: string;
    searchPlaceholder: string;
    allKinds: string;
    kindDaily: string;
    kindWeekly: string;
    kindMonthly: string;
    period: string;
    scope: string;
    stores: string;
    status: string;
    generated: string;
    format: string;
    actions: string;
    statuses: Record<string, string>;
    scheduleName: string;
    cadence: string;
    recipients: string;
    active: string;
    inactive: string;
    newReport: string;
    newReportTitle: string;
    newReportBody: string;
    newReportKind: string;
    newReportScope: string;
    newReportSubmit: string;
    newReportSuccess: string;
    exportCta: string;
    exportNote: string;
    summaryTitle: string;
    summaryVisitors: string;
    summaryAvailability: string;
    summaryOos: string;
    summaryMismatch: string;
    summaryTasks: string;
    summaryStock: string;
    seriesTitle: string;
    seriesBody: string;
    seriesAvailability: string;
    seriesOos: string;
    viewSummary: string;
    hideSummary: string;
    emptyTitle: string;
    emptyBody: string;
  };
}) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [reports, setReports] = useState(initialReports);
  const [tab, setTab] = useState<"reports" | "schedules">("reports");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [newKind, setNewKind] = useState("daily");
  const [newScope, setNewScope] = useState(t.reports.allStores);
  const hasFilters = Boolean(query || kind);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      reports.filter((report) => {
        const matchesKind = !kind || report.kind === kind;
        const matchesQuery =
          !needle ||
          report.title.toLowerCase().includes(needle) ||
          report.period_from.includes(needle) ||
          report.scope.toLowerCase().includes(needle);
        return matchesKind && matchesQuery;
      }),
    [reports, kind, needle],
  );

  const kindLabel: Record<string, string> = {
    daily: labels.kindDaily,
    weekly: labels.kindWeekly,
    monthly: labels.kindMonthly,
  };

  function downloadReport(report: ReportRow) {
    const rows = [
      [t.reports.csvReport, report.title],
      [t.reports.csvId, report.id],
      ["", `${report.period_from} ${t.reports.periodTo} ${report.period_to}`],
      [labels.scope, report.scope],
      [labels.generated, report.generated_at ?? "-"],
      [],
      [t.reports.csvMetric, t.reports.csvValue],
      [labels.summaryVisitors, String(report.metrics.visitors)],
      [labels.summaryAvailability, String(report.metrics.availability_pct)],
      [labels.summaryOos, String(report.metrics.oos_rate_pct)],
      [labels.summaryMismatch, String(report.metrics.price_mismatch)],
      [labels.summaryTasks, String(report.metrics.tasks_open)],
      [labels.summaryStock, String(report.metrics.stock_value_idr)],
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportList() {
    const rows = [
      [t.reports.csvId, t.reports.csvTitle, t.reports.csvKind, labels.period, labels.scope, labels.status, labels.generated, labels.format],
      ...filtered.map((report) => [
        report.id,
        report.title,
        kindLabel[report.kind] ?? report.kind,
        `${report.period_from} ${t.reports.periodTo} ${report.period_to}`,
        report.scope,
        labels.statuses[report.status] ?? report.status,
        report.generated_at ?? "-",
        report.format,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ShelfOpsRetail-reports.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: labels.exportCta, variant: "success" });
  }

  function createReport() {
    const today = new Date().toISOString().slice(0, 10);
    const nextNumber =
      reports.reduce(
        (max, report) =>
          Math.max(max, Number(report.id.match(/(\d+)$/)?.[1] ?? 0)),
        0,
      ) + 1;
    const next: ReportRow = {
      id: `RPT-2026-${nextNumber}`,
      title: `${kindLabel[newKind] ?? labels.kindDaily}: ${newScope}`,
      kind: newKind as ReportRow["kind"],
      period_from: today,
      period_to: today,
      scope: newScope,
      stores_count: newScope === t.reports.allStores ? 20 : 8,
      status: "ready",
      generated_at: `${today}T09:00:00+07:00`,
      format: "CSV",
      metrics: baseMetrics,
    };
    setReports((current) => [next, ...current]);
    setExpanded(next.id);
    setOpen(false);
    setTab("reports");
    toast({ title: labels.newReportSuccess, variant: "success" });
  }

  const availabilityValues = series.map((point) => point.availability_pct);
  const avgAvailability =
    availabilityValues.reduce((sum, value) => sum + value, 0) /
    Math.max(1, availabilityValues.length);

  const tabClass = (active: boolean) =>
    cn(
      "border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      active
        ? "border-accent text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full space-y-1.5 sm:max-w-xs">
            <Label htmlFor="report-search">{labels.search}</Label>
            <Input
              id="report-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchPlaceholder}
            />
          </div>
          <div className="w-full space-y-1.5 sm:max-w-48">
            <Label htmlFor="report-kind">{labels.allKinds}</Label>
            <select
              id="report-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
            >
              <option value="">{labels.allKinds}</option>
              <option value="daily">{labels.kindDaily}</option>
              <option value="weekly">{labels.kindWeekly}</option>
              <option value="monthly">{labels.kindMonthly}</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={exportList}>
            <Download />
            {labels.exportCta}
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            <Plus />
            {labels.newReport}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border" role="tablist">
        <button
          type="button"
          role="tab"
          id="tab-reports"
          aria-selected={tab === "reports"}
          onClick={() => setTab("reports")}
          className={tabClass(tab === "reports")}
        >
          {labels.tabReports} ({formatNumber(reports.length, locale)})
        </button>
        <button
          type="button"
          role="tab"
          id="tab-schedules"
          aria-selected={tab === "schedules"}
          onClick={() => setTab("schedules")}
          className={tabClass(tab === "schedules")}
        >
          {labels.tabSchedules} ({formatNumber(schedules.length, locale)})
        </button>
      </div>

      {tab === "reports" ? (
        <div
          role="tabpanel"
          id="panel-reports"
          aria-labelledby="tab-reports"
          tabIndex={0}
          className="space-y-4"
        >
          <div className="rounded-lg border border-border">
            <Table aria-label={labels.tabReports}>
              <TableHeader>
                <TableRow>
                  <TableHead>{labels.scheduleName}</TableHead>
                  <TableHead className="hidden md:table-cell">{labels.period}</TableHead>
                  <TableHead className="hidden lg:table-cell">{labels.scope}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{labels.stores}</TableHead>
                  <TableHead className="text-right">{labels.status}</TableHead>
                  <TableHead className="hidden whitespace-nowrap lg:table-cell">{labels.generated}</TableHead>
                  <TableHead className="text-right max-sm:static sm:sticky sm:right-0 z-10 bg-surface-subtle border-l border-border">
                    {labels.actions}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((report) => {
                  const openRow = expanded === report.id;
                  return (
                    <Fragment key={report.id}>
                      <TableRow className="group hover:bg-muted/60">
                        <TableCell>
                          <span className="block max-w-[22rem] truncate text-sm font-medium text-foreground" title={report.title}>
                            {report.title}
                          </span>
                          <span className="tabular block text-[11px] text-muted-foreground">
                            {kindLabel[report.kind] ?? report.kind} · {report.format}
                          </span>
                        </TableCell>
                        <TableCell className="tabular hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                          {formatDate(report.period_from, locale)} {t.reports.periodTo} {formatDate(report.period_to, locale)}
                        </TableCell>
                        <TableCell className="hidden max-w-[12rem] truncate text-sm text-muted-foreground lg:table-cell">
                          {report.scope}
                        </TableCell>
                        <TableCell className="tabular hidden text-right text-sm sm:table-cell">
                          {formatNumber(report.stores_count, locale)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={STATUS_VARIANT[report.status] ?? "outline"}>
                            {labels.statuses[report.status] ?? report.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                          {report.generated_at
                            ? report.generated_at.slice(0, 16).replace("T", " ")
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right max-sm:static sm:sticky sm:right-0 bg-background group-hover:bg-muted/60 border-l border-border">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip label={openRow ? labels.hideSummary : labels.viewSummary}>
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                onClick={() => setExpanded(openRow ? null : report.id)}
                                aria-expanded={openRow}
                                aria-label={openRow ? labels.hideSummary : labels.viewSummary}
                              >
                                {openRow ? (
                                  <ChevronUp className="text-accent" />
                                ) : (
                                  <ChevronDown className="text-accent" />
                                )}
                              </Button>
                            </Tooltip>
                            <Tooltip label={t.reports.downloadCsv}>
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                onClick={() => downloadReport(report)}
                                aria-label={`${t.reports.downloadCsv}: ${report.id}`}
                              >
                                <Download className="text-success" />
                              </Button>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                      {openRow ? (
                        <TableRow key={`${report.id}-summary`} className="bg-muted/50">
                          <TableCell colSpan={6} className="align-top">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {labels.summaryTitle}
                                </p>
                                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                                  {[
                                    [labels.summaryVisitors, formatNumber(report.metrics.visitors, locale)],
                                    [labels.summaryAvailability, `${report.metrics.availability_pct.toFixed(1)}%`],
                                    [labels.summaryOos, `${report.metrics.oos_rate_pct.toFixed(1)}%`],
                                    [labels.summaryMismatch, formatNumber(report.metrics.price_mismatch, locale)],
                                    [labels.summaryTasks, formatNumber(report.metrics.tasks_open, locale)],
                                    [labels.summaryStock, formatCurrency(report.metrics.stock_value_idr, locale)],
                                  ].map(([label, value]) => (
                                    <div key={label}>
                                      <dt className="text-[11px] text-muted-foreground">{label}</dt>
                                      <dd className="tabular text-sm font-medium text-foreground">{value}</dd>
                                    </div>
                                  ))}
                                </dl>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell aria-hidden="true" className="max-sm:static sm:sticky sm:right-0 bg-muted/50 border-l border-border" />
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
                <p className="text-sm font-medium text-foreground">
                  {hasFilters ? t.reports.emptyFilteredTitle : labels.emptyTitle}
                </p>
                {hasFilters ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {t.reports.emptyFilteredBody}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setQuery("");
                        setKind("");
                      }}
                    >
                      {t.common.resetFilter}
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <figure className="rounded-lg border border-border bg-background p-4">
            <figcaption className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">{labels.seriesTitle}</h2>
              <p className="text-xs text-muted-foreground">{labels.seriesBody}</p>
            </figcaption>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {t.chart.peak}
                <span className="tabular text-foreground">
                  {Math.max(...availabilityValues, 0).toFixed(1)}%
                </span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {t.chart.average}
                <span className="tabular text-foreground">
                  {(
                    availabilityValues.reduce((sum, value) => sum + value, 0) /
                    Math.max(1, availabilityValues.length)
                  ).toFixed(1)}
                  %
                </span>
              </span>
            </div>
            <PremiumAreaChart
              data={series as unknown as Record<string, unknown>[]}
              xKey="date"
              yKey="availability_pct"
              seriesName={labels.seriesAvailability}
              height={240}
              ariaLabel={labels.seriesTitle}
              margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
              yAxisWidth={44}
              xTickFormatter={(value) => String(value).slice(5)}
            />
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{series[0]?.date}</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-accent/80" aria-hidden="true" />
                  {labels.seriesAvailability}
                </span>
                <span>
                  {labels.seriesOos}: {series[series.length - 1]?.oos_rate_pct.toFixed(1)}%
                </span>
              </span>
              <span>{series[series.length - 1]?.date}</span>
            </div>
            <table className="sr-only">
              <caption>{labels.seriesTitle}</caption>
              <thead>
                <tr>
                  <th>{labels.period}</th>
                  <th>{labels.summaryAvailability}</th>
                  <th>{labels.summaryOos}</th>
                  <th>{labels.summaryVisitors}</th>
                </tr>
              </thead>
              <tbody>
                {series.map((point) => (
                  <tr key={point.date}>
                    <td>{point.date}</td>
                    <td>{point.availability_pct}%</td>
                    <td>{point.oos_rate_pct}%</td>
                    <td>{point.visitors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>
          <p className="text-xs text-muted-foreground">{labels.exportNote}</p>
        </div>
      ) : null}

      {tab === "schedules" ? (
        <div
          role="tabpanel"
          id="panel-schedules"
          aria-labelledby="tab-schedules"
          tabIndex={0}
          className="rounded-lg border border-border"
        >
          <Table aria-label={labels.tabSchedules}>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.scheduleName}</TableHead>
                <TableHead className="hidden sm:table-cell">{labels.cadence}</TableHead>
                <TableHead className="hidden lg:table-cell">{labels.scope}</TableHead>
                <TableHead className="hidden lg:table-cell">{labels.recipients}</TableHead>
                <TableHead className="text-right">{labels.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.id} className="hover:bg-muted/60">
                  <TableCell>
                    <span className="block text-sm font-medium text-foreground">{schedule.name}</span>
                    <span className="tabular block text-[11px] text-muted-foreground">
                      {schedule.id} · {schedule.format}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {schedule.cadence}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {schedule.scope}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {Array.isArray(schedule.recipients)
                      ? schedule.recipients.join(", ")
                      : schedule.recipients}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={schedule.active ? "success" : "neutral"}>
                      {schedule.active ? labels.active : labels.inactive}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.newReportTitle}</DialogTitle>
            <DialogDescription>{labels.newReportBody}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="report-new-kind">{labels.newReportKind}</Label>
              <select
                id="report-new-kind"
                value={newKind}
                onChange={(event) => setNewKind(event.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
              >
                <option value="daily">{labels.kindDaily}</option>
                <option value="weekly">{labels.kindWeekly}</option>
                <option value="monthly">{labels.kindMonthly}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-new-scope">{labels.newReportScope}</Label>
              <select
                id="report-new-scope"
                value={newScope}
                onChange={(event) => setNewScope(event.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
              >
                <option value={t.reports.allStores}>{t.reports.allStores}</option>
                <option value="Jawa Barat">Jawa Barat</option>
                <option value="Jawa Tengah">Jawa Tengah</option>
                <option value="Jawa Timur">Jawa Timur</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="button" onClick={createReport}>
              {labels.newReportSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

