"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { AuditLogEntry } from "@/lib/types";

export function AuditTable({ logs }: { logs: AuditLogEntry[] }) {
  const { t, locale } = useI18n();
  const [action, setAction] = useState("all");

  const actions = useMemo(
    () => Array.from(new Set(logs.map((entry) => entry.action))).sort(),
    [logs],
  );
  const filtered = useMemo(
    () => (action === "all" ? logs : logs.filter((entry) => entry.action === action)),
    [logs, action],
  );

  function actionLabel(value: string) {
    const dictionary = t.audit.actions as Record<string, string>;
    return dictionary[value] ?? value;
  }

  if (logs.length === 0) {
    return <EmptyState title={t.audit.emptyTitle} body={t.audit.emptyBody} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {filtered.length} {t.audit.count}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="audit-action" className="sr-only">
            {t.audit.filterAction}
          </label>
          <select
            id="audit-action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 sm:h-9"
          >
            <option value="all">{t.audit.filterAction}</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {actionLabel(value)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.audit.time}</TableHead>
              <TableHead>{t.audit.actor}</TableHead>
              <TableHead>{t.audit.action}</TableHead>
              <TableHead className="hidden lg:table-cell">{t.audit.target}</TableHead>
              <TableHead className="hidden xl:table-cell">{t.audit.detail}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap align-top text-xs text-muted-foreground">
                  {formatDateTime(entry.created_at, locale)}
                </TableCell>
                <TableCell className="align-top">
                  <p className="text-sm font-medium text-foreground">
                    {entry.actor_name}
                  </p>
                </TableCell>
                <TableCell className="align-top">
                  <Badge variant="outline">{actionLabel(entry.action)}</Badge>
                </TableCell>
                <TableCell className="hidden max-w-56 align-top lg:table-cell">
                  <p className="truncate text-xs text-muted-foreground" title={entry.target}>
                    {entry.target}
                  </p>
                </TableCell>
                <TableCell className="hidden max-w-80 align-top text-sm text-muted-foreground xl:table-cell">
                  {entry.detail}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.audit.emptyBody}</p>
      ) : null}
    </div>
  );
}
