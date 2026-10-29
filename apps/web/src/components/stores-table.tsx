"use client";

import type { Store } from "@shelfops/api-client";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Search } from "@/components/icons";
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
import { useI18n } from "@/lib/i18n/client";
import { titleCaseChannel } from "@/lib/format";
import { cn, linkIdentityClass } from "@/lib/utils";

interface StoreMetrics {
  audits: number;
  compliance: number;
  oos: number;
}

export function StoresTable({
  stores,
  metrics = {},
}: {
  stores: Store[];
  metrics?: Record<string, StoreMetrics>;
}) {
  const { t, locale } = useI18n();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");

  const regions = useMemo(
    () => [...new Set(stores.map((store) => store.region).filter(Boolean))].sort(),
    [stores],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return stores.filter((store) => {
      const matchesRegion = !region || store.region === region;
      const matchesQuery =
        !needle ||
        store.name.toLowerCase().includes(needle) ||
        store.code.toLowerCase().includes(needle);
      return matchesRegion && matchesQuery;
    });
  }, [stores, query, region]);

  const hasFilters = Boolean(query || region);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full space-y-1.5 sm:max-w-xs">
            <Label htmlFor="store-search">{t.common.search}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="store-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.stores.searchPlaceholder}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-full space-y-1.5 sm:max-w-52">
            <Label htmlFor="store-region">{t.common.region}</Label>
            <select
              id="store-region"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 sm:h-9"
            >
              <option value="">{t.stores.allRegions}</option>
              {regions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setRegion("");
              }}
            >
              {t.common.resetFilter}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {hasFilters
            ? `${t.stores.showing} ${filtered.length} ${t.stores.ofTotal} ${stores.length} ${t.stores.count}`
            : `${stores.length} ${t.stores.count}`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={query || region ? t.stores.emptyFilteredTitle : t.stores.emptyTitle}
          body={query || region ? t.stores.emptyFilteredBody : t.stores.emptyBody}
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table aria-label={t.stores.title}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">{t.stores.code}</TableHead>
                <TableHead>{t.stores.name}</TableHead>
                <TableHead className="hidden w-32 md:table-cell">
                  {t.stores.channel}
                </TableHead>
                <TableHead className="hidden w-28 text-right sm:table-cell">
                  {t.stores.oosShort}
                </TableHead>
                <TableHead className="hidden w-32 text-right md:table-cell">
                  {t.stores.availabilityShort}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((store) => {
                const metric = metrics[store.id];
                return (
                  <TableRow key={store.id} className="group">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {store.code}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/stores/${store.id}`}
                        className={cn("block truncate", linkIdentityClass)}
                      >
                        {store.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {store.region}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {store.channel
                        ? (t.channels[store.channel] ?? titleCaseChannel(store.channel))
                        : "-"}
                    </TableCell>
                    <TableCell className="tabular hidden text-right sm:table-cell">
                      {metric ? (
                        <span
                          className={
                            metric.oos >= 5
                              ? "font-medium text-danger-strong"
                              : metric.oos >= 2
                                ? "text-warning-strong"
                                : "text-muted-foreground"
                          }
                        >
                          {number.format(metric.oos)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right md:table-cell">
                      {metric ? (
                        <span className="inline-flex items-center justify-end gap-2">
                          <span className="hidden h-1.5 w-10 overflow-hidden rounded-full bg-muted lg:block">
                            <span
                              className={
                                metric.compliance >= 90
                                  ? "block h-full rounded-full bg-success"
                                  : metric.compliance >= 85
                                    ? "block h-full rounded-full bg-warning"
                                    : "block h-full rounded-full bg-danger"
                              }
                              style={{ width: `${Math.max(0, Math.min(100, metric.compliance))}%` }}
                            />
                          </span>
                          <span className="tabular text-sm font-medium text-foreground">
                            {number.format(metric.compliance)}
                            <span className="text-[11px] font-normal text-muted-foreground">/100</span>
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
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
