"use client";

import type { AuditSession } from "@shelfops/api-client";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, linkIdentityClass } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { shortId } from "@/lib/format";

export function SessionsTable({
  sessions,
  showStore = true,
  showImages = true,
}: {
  sessions: AuditSession[];
  showStore?: boolean;
  showImages?: boolean;
}) {
  const { t, locale } = useI18n();

  return (
    <Table aria-label={t.sessions.title}>
      <TableHeader>
        <TableRow>
          <TableHead>{t.sessions.session}</TableHead>
          {showStore ? <TableHead>{t.sessions.store}</TableHead> : null}
          <TableHead className="hidden sm:table-cell">{t.sessions.date}</TableHead>
          <TableHead>{t.sessions.status}</TableHead>
          {showImages ? (
            <TableHead className="hidden text-right sm:table-cell">
              {t.sessions.images}
            </TableHead>
          ) : null}
          <TableHead className="text-right" title={t.sessions.scoreNote}>
            {t.sessions.score}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => (
          <TableRow key={session.id} className="group">
            <TableCell>
              <Link
                href={`/shelf/${session.id}`}
                className={cn("font-mono text-xs", linkIdentityClass)}
              >
                {shortId(session.id)}
              </Link>
            </TableCell>
            {showStore ? (
              <TableCell className="min-w-40">
                <Link
                  href={`/stores/${session.store_id}`}
                  className={cn("text-sm", linkIdentityClass)}
                >
                  {session.store_name ?? t.common.store}
                </Link>
              </TableCell>
            ) : null}
            <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
              {formatDate(session.created_at, locale)}
            </TableCell>
            <TableCell>
              <StatusBadge kind="session" value={session.status} />
            </TableCell>
            {showImages ? (
              <TableCell className="tabular hidden whitespace-nowrap text-right text-muted-foreground sm:table-cell">
                {session.image_count ?? "-"} {t.sessions.imageUnit}
                {session.failed_count ? (
                  <span className="ml-1.5 text-[11px] text-danger-strong">
                    · {session.failed_count} {t.sessions.failedUnit}
                  </span>
                ) : null}
              </TableCell>
            ) : null}
            <TableCell className="text-right">
              {session.score != null ? (
                <span className="inline-flex items-center justify-end gap-2">
                  <span className="hidden h-1.5 w-10 overflow-hidden rounded-full bg-muted sm:block">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        session.score >= 90
                          ? "bg-success"
                          : session.score >= 85
                            ? "bg-warning"
                            : "bg-danger",
                      )}
                      style={{ width: `${Math.max(0, Math.min(100, session.score))}%` }}
                    />
                  </span>
                  <span className="tabular text-sm font-medium text-foreground">
                    {session.score}
                    <span className="text-[11px] font-normal text-muted-foreground">/100</span>
                  </span>
                </span>
              ) : (
                "-"
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

