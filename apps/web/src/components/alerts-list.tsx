"use client";

import type { Alert } from "@shelfops/api-client";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { formatDateTimeMedium } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const severityDot = {
  high: "bg-danger",
  medium: "bg-warning",
  low: "bg-zinc-400",
} as const;

export function AlertsList({
  alerts,
  linkToSessions = false,
  showStore = true,
  columns = 1,
  className,
}: {
  alerts: Alert[];
  linkToSessions?: boolean;
  showStore?: boolean;
  columns?: 1 | 2;
  className?: string;
}) {
  const { t, locale } = useI18n();

  return (
    <ul
      className={cn(
        columns === 2 ? "grid md:grid-cols-2" : "",
        className,
      )}
    >
      {alerts.map((alert) => (
        <li key={alert.id} className="border-b border-border px-5 py-3 transition-colors hover:bg-surface-subtle">
          <Link
            href={
              linkToSessions && alert.session_id
                ? `/shelf/${alert.session_id}`
                : "/alerts"
            }
            className="flex items-start gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span
              className={cn(
                "mt-1.5 size-1.5 shrink-0 rounded-full",
                severityDot[alert.severity],
              )}
              aria-hidden="true"
            />
            <span className="sr-only">{t.status.severity[alert.severity]}</span>
            <span className="min-w-0 flex-1 space-y-1">
              <span className="flex items-start justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {t.status.alertType[alert.type] ?? alert.type}
                </span>
                <StatusBadge kind="alert" value={alert.status} />
              </span>
              <span className="block text-sm text-muted-foreground">{alert.detail}</span>
              <span className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {showStore ? (
                  <>
                    <span className="truncate">{alert.store_name ?? t.common.store}</span>
                    <span aria-hidden="true">·</span>
                  </>
                ) : null}
                <span>{formatDateTimeMedium(alert.created_at, locale)}</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

