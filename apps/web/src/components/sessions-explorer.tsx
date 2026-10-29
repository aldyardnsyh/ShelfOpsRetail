"use client";

import type { AuditSession } from "@shelfops/api-client";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Search } from "@/components/icons";
import { SessionsTable } from "@/components/sessions-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/client";

const STATUSES = ["draft", "processing", "review", "final", "partial"] as const;
const PAGE_SIZE = 15;

type SortKey = "newest" | "oldest" | "score_desc" | "score_asc";

export function SessionsExplorer({ sessions }: { sessions: AuditSession[] }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = sessions.filter((session) => {
      const matchesStatus = !status || session.status === status;
      const matchesQuery =
        !needle ||
        (session.store_name ?? "").toLowerCase().includes(needle) ||
        session.id.toLowerCase().includes(needle);
      return matchesStatus && matchesQuery;
    });

    return [...rows].sort((a, b) => {
      if (sort === "newest" || sort === "oldest") {
        const diff = (a.created_at ?? "").localeCompare(b.created_at ?? "");
        return sort === "newest" ? -diff : diff;
      }
      const av = a.score ?? -1;
      const bv = b.score ?? -1;
      return sort === "score_desc" ? bv - av : av - bv;
    });
  }, [sessions, query, status, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);
  const end = start + pageRows.length;
  const hasFilters = Boolean(query || status || sort !== "newest");

  function reset() {
    setQuery("");
    setStatus("");
    setSort("newest");
    setPage(0);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="w-full space-y-1.5 sm:max-w-xs">
            <Label htmlFor="session-search">{t.common.search}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="session-search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                placeholder={t.sessions.searchPlaceholder}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-full space-y-1.5 sm:max-w-52">
            <Label htmlFor="session-status">{t.common.status}</Label>
            <select
              id="session-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(0);
              }}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 sm:h-9"
            >
              <option value="">{t.sessions.filterStatus}</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t.status.session[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full space-y-1.5 sm:max-w-48">
            <Label htmlFor="session-sort">{t.sessions.sortLabel}</Label>
            <select
              id="session-sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as SortKey);
                setPage(0);
              }}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 sm:h-9"
            >
              <option value="newest">{t.sessions.sortNewest}</option>
              <option value="oldest">{t.sessions.sortOldest}</option>
              <option value="score_desc">{t.sessions.sortScoreHigh}</option>
              <option value="score_asc">{t.sessions.sortScoreLow}</option>
            </select>
          </div>
          {hasFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              {t.common.resetFilter}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} {t.sessions.count}
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={
            query || status
              ? t.sessions.emptyFilteredTitle
              : t.sessions.emptyTitle
          }
          body={
            query || status ? t.sessions.emptyFilteredBody : t.sessions.emptyBody
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-border">
            <SessionsTable sessions={pageRows} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="tabular text-xs text-muted-foreground">
              {start + 1}-{end} / {filtered.length} {t.sessions.count}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                {t.common.previous}
              </Button>
              <span className="tabular text-xs text-muted-foreground">
                {currentPage + 1} / {totalPages}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                {t.common.next}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
