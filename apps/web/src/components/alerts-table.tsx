"use client";

import type { Alert, AlertStatus } from "@shelfops/api-client";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { updateAlertStatusAction } from "@/actions/alerts";
import { EmptyState } from "@/components/empty-state";
import { Bell, Check, CheckCircle, ClipboardList, Search } from "@/components/icons";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatDateTimeShort } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { shortId } from "@/lib/format";
import { cn, linkIdentityClass } from "@/lib/utils";

const STATUSES: AlertStatus[] = ["open", "acknowledged", "resolved"];
const TYPES = ["oos", "price_mismatch", "low_confidence"] as const;
const SEVERITIES = ["high", "medium", "low"] as const;

export function AlertsTable({
  alerts: initialAlerts,
  canUpdate,
  highlightId,
}: {
  alerts: Alert[];
  canUpdate: boolean;
  highlightId?: string;
}) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const reason = t.states.forbiddenBody;
  const [alerts, setAlerts] = useState(initialAlerts);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeHighlight, setActiveHighlight] = useState<string | undefined>(highlightId);

  useEffect(() => {
    if (!highlightId) return;
    setActiveHighlight(highlightId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      document.getElementById(highlightId)?.scrollIntoView({ block: "center" });
      timer = setTimeout(() => setActiveHighlight(undefined), 3000);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [highlightId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return alerts.filter((alert) => {
      const matchesStatus = !status || alert.status === status;
      const matchesType = !type || alert.type === type;
      const matchesSeverity = !severity || alert.severity === severity;
      const matchesQuery =
        !needle ||
        (alert.store_name ?? "").toLowerCase().includes(needle) ||
        (alert.detail ?? "").toLowerCase().includes(needle);
      return matchesStatus && matchesType && matchesSeverity && matchesQuery;
    });
  }, [alerts, query, status, type, severity]);

  function updateStatus(alert: Alert, next: AlertStatus) {
    setPendingId(alert.id);
    startTransition(async () => {
      const result = await updateAlertStatusAction(alert.id, next);
      setPendingId(null);
      if (!result.ok) {
        toast({ title: t.alerts.updateError, variant: "error" });
        return;
      }
      setAlerts((current) =>
        current.map((item) =>
          item.id === alert.id ? { ...item, status: next } : item,
        ),
      );
      toast({
        title:
          next === "resolved" ? t.alerts.resolvedToast : t.alerts.acknowledgedToast,
        description: result.demo ? t.alerts.demoToast : undefined,
        variant: "success",
      });
    });
  }

  const hasFilters = Boolean(query || status || type || severity);
  const openCount = alerts.filter((alert) => alert.status === "open").length;
  const unresolvedCount = alerts.filter((alert) => alert.status !== "resolved").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="alert-search">{t.common.search}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="alert-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.alerts.searchPlaceholder}
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="alert-status">{t.alerts.filterStatus}</Label>
          <select
            id="alert-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 sm:h-9"
          >
            <option value="">{t.alerts.allStatuses}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t.status.alert[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="alert-type">{t.alerts.filterType}</Label>
          <select
            id="alert-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 sm:h-9"
          >
            <option value="">{t.alerts.allTypes}</option>
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {t.status.alertType[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="alert-severity">{t.alerts.filterSeverity}</Label>
          <select
            id="alert-severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 sm:h-9"
          >
            <option value="">{t.alerts.allSeverities}</option>
            {SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {t.status.severity[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {openCount} {t.alerts.openCount} · {unresolvedCount} {t.alerts.unresolvedCount} ·{" "}
          {filtered.length} {t.alerts.count}
        </p>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setStatus("");
              setType("");
              setSeverity("");
            }}
          >
            {t.common.resetFilter}
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={hasFilters ? t.alerts.emptyFilteredTitle : t.alerts.emptyTitle}
          body={hasFilters ? t.alerts.emptyFilteredBody : t.alerts.emptyBody}
        />
      ) : (
        <div className="rounded-lg border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {t.alerts.tableTitle}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t.alerts.tableSubtitle}
              </p>
            </div>
          </div>
          <Table className="min-w-[880px]" aria-label={t.alerts.tableTitle}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">{t.alerts.severityLabel}</TableHead>
                <TableHead className="w-40">{t.common.store}</TableHead>
                <TableHead className="hidden w-32 md:table-cell">
                  {t.alerts.typeLabel}
                </TableHead>
                <TableHead>{t.alerts.detail}</TableHead>
                <TableHead className="hidden w-28 xl:table-cell">
                  {t.alerts.created}
                </TableHead>
                <TableHead className="w-28">{t.alerts.statusLabel}</TableHead>
                <TableHead className="w-24 whitespace-nowrap text-right sticky right-0 z-10 bg-surface-subtle border-l border-border">
                  {t.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((alert) => {
                const busy = isPending && pendingId === alert.id;
                const highlighted = alert.id === activeHighlight;
                return (
                  <TableRow
                    key={alert.id}
                    id={alert.id}
                    data-highlight={highlighted ? "true" : undefined}
                    className={cn("group", highlighted && "bg-accent-soft/40")}
                  >
                    <TableCell>
                      <StatusBadge kind="severity" value={alert.severity} />
                    </TableCell>
                    <TableCell className="min-w-36">
                      {alert.store_id ? (
                        <Link
                          href={`/stores/${alert.store_id}`}
                          className={cn("text-sm", linkIdentityClass)}
                        >
                          {alert.store_name ?? t.common.store}
                        </Link>
                      ) : (
                        alert.store_name ?? "-"
                      )}
                      {alert.session_id ? (
                        <Link
                          href={`/shelf/${alert.session_id}`}
                          className={cn("block font-mono text-[11px] text-muted-foreground", linkIdentityClass)}
                        >
                          {shortId(alert.session_id)}
                        </Link>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <StatusBadge
                        kind="alertType"
                        value={alert.type}
                        className="whitespace-nowrap"
                      />
                    </TableCell>
                    <TableCell className="break-words text-sm text-muted-foreground">
                      {alert.detail}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground xl:table-cell">
                      {formatDateTimeShort(alert.created_at, locale)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="alert" value={alert.status} />
                    </TableCell>
                    <TableCell className="text-right sticky right-0 bg-background group-hover:bg-surface-subtle border-l border-border">
                      <div className="flex items-center justify-end gap-1">
                        {alert.status === "open" ? (
                          <Tooltip label={!canUpdate ? reason : t.alerts.acknowledge}>
                            <Button
                              type="button"
                              aria-disabled={!canUpdate || busy}
                              title={!canUpdate ? reason : undefined}
                              variant="secondary"
                              size="icon"
                              onClick={() => {
                                if (!canUpdate || busy) return;
                                updateStatus(alert, "acknowledged");
                              }}
                              aria-label={`${t.alerts.acknowledge}: ${alert.store_name ?? alert.detail}`}
                            >
                              <Check className="text-success" />
                            </Button>
                          </Tooltip>
                        ) : alert.status === "acknowledged" ? (
                          <Tooltip label={!canUpdate ? reason : t.alerts.resolve}>
                            <Button
                              type="button"
                              aria-disabled={!canUpdate || busy}
                              title={!canUpdate ? reason : undefined}
                              variant="secondary"
                              size="icon"
                              onClick={() => {
                                if (!canUpdate || busy) return;
                                updateStatus(alert, "resolved");
                              }}
                              aria-label={`${t.alerts.resolve}: ${alert.store_name ?? alert.detail}`}
                            >
                              <CheckCircle className="text-success" />
                            </Button>
                          </Tooltip>
                        ) : null}
                        {alert.session_id ? (
                          <Tooltip label={t.alerts.sessionLink}>
                            <Button asChild variant="secondary" size="icon">
                              <Link
                                href={`/shelf/${alert.session_id}`}
                                aria-label={`${t.alerts.sessionLink}: ${alert.store_name ?? alert.detail}`}
                              >
                                <ClipboardList className="text-accent" />
                              </Link>
                            </Button>
                          </Tooltip>
                        ) : null}
                        <Tooltip label={t.alerts.createTask}>
                          <Button asChild variant="secondary" size="icon">
                            <Link
                              href={`/tasks?alert=${alert.id}`}
                              aria-label={`${t.alerts.createTask}: ${alert.store_name ?? alert.detail}`}
                            >
                                <Bell className="text-warning-strong" />
                            </Link>
                          </Button>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

