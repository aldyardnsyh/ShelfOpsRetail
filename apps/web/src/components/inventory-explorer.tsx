"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Plus, Tag } from "@/components/icons";

import { Badge } from "@/components/ui/badge";
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
import { useI18n } from "@/lib/i18n/client";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Balance {
  store_id: string;
  store_name: string;
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  on_hand: number;
  reserved: number;
  available: number;
  reorder_point: number;
  low: boolean;
  price_idr: number;
}

interface Movement {
  id: string;
  store_id: string;
  store_name: string;
  unit: string;
  sku: string;
  product_name: string;
  kind: string;
  qty: number;
  unit_cost_idr: number;
  reason: string;
  ref: string;
  created_at: string;
}

type StockFilter = "all" | "healthy" | "low" | "out";

export function InventoryExplorer({
  balances,
  movements,
  stores,
  labels,
}: {
  balances: Balance[];
  movements: Movement[];
  stores: { id: string; name: string }[];
  labels: {
    title: string;
    product: string;
    store: string;
    onHand: string;
    reserved: string;
    available: string;
    reorder: string;
    status: string;
    actions: string;
    movementsTitle: string;
    filterAll: string;
    filterLow: string;
    filterOut: string;
    filterHealthy: string;
    shownOf: string;
    search: string;
    searchPlaceholder: string;
    normal: string;
    low: string;
    out: string;
    qty: string;
    reason: string;
    ref: string;
    when: string;
    createPo: string;
    viewPricing: string;
  };
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [store, setStore] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [tab, setTab] = useState<"stock" | "movements">("stock");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return balances
      .filter((b) => {
        const matchesStore = !store || b.store_id === store;
        const matchesStatus =
          filter === "all"
            ? true
            : filter === "out"
              ? b.available <= 0
              : filter === "low"
                ? b.low && b.available > 0
                : !b.low && b.available > 0;
        const matchesQuery =
          !needle ||
          b.product_name.toLowerCase().includes(needle) ||
          b.sku.toLowerCase().includes(needle) ||
          b.store_name.toLowerCase().includes(needle);
        return matchesStore && matchesStatus && matchesQuery;
      })
      .sort((a, b) => a.available - b.available);
  }, [balances, query, store, filter]);

  const visibleMovements = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return movements
      .filter((m) => {
        const matchesStore = !store || m.store_id === store;
        const matchesQuery =
          !needle ||
          m.product_name.toLowerCase().includes(needle) ||
          m.sku.toLowerCase().includes(needle) ||
          m.ref.toLowerCase().includes(needle);
        return matchesStore && matchesQuery;
      });
  }, [movements, query, store, stores]);

  const counts = useMemo(
    () => ({
      all: balances.length,
      low: balances.filter((b) => b.low && b.available > 0).length,
      out: balances.filter((b) => b.available <= 0).length,
      healthy: balances.filter((b) => !b.low && b.available > 0).length,
    }),
    [balances],
  );

  const hasFilters = Boolean(query || store || filter !== "all");

  const filterBtn = (value: StockFilter, label: string, count: number) => (
    <button
      key={value}
      type="button"
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className={cn(
        "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        filter === value
          ? "border-accent bg-accent-soft text-accent-strong"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label} ({formatNumber(count, locale)})
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full space-y-1.5 sm:max-w-xs">
            <Label htmlFor="inv-search">{labels.search}</Label>
            <Input
              id="inv-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={labels.searchPlaceholder}
            />
          </div>
          <div className="w-full space-y-1.5 sm:max-w-52">
            <Label htmlFor="inv-store">{labels.store}</Label>
            <select
              id="inv-store"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
            >
              <option value="">{t.common.all}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {filterBtn("all", labels.filterAll, counts.all)}
          {filterBtn("low", labels.filterLow, counts.low)}
          {filterBtn("out", labels.filterOut, counts.out)}
          {filterBtn("healthy", labels.filterHealthy, counts.healthy)}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border" role="tablist">
        <button
          type="button"
          role="tab"
          id="tab-stock"
          aria-selected={tab === "stock"}
          onClick={() => setTab("stock")}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab === "stock"
              ? "border-accent text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {labels.title}
        </button>
        <button
          type="button"
          role="tab"
          id="tab-movements"
          aria-selected={tab === "movements"}
          onClick={() => setTab("movements")}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab === "movements"
              ? "border-accent text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {labels.movementsTitle}
        </button>
      </div>

      {tab === "stock" ? (
        <div
          role="tabpanel"
          id="panel-stock"
          aria-labelledby="tab-stock"
          tabIndex={0}
          className="rounded-lg border border-border"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.product}</TableHead>
                <TableHead>{labels.store}</TableHead>
                <TableHead className="text-right">{labels.onHand}</TableHead>
                <TableHead className="hidden text-right md:table-cell">{labels.reserved}</TableHead>
                <TableHead className="text-right">{labels.available}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{labels.reorder}</TableHead>
                <TableHead className="text-right">{labels.status}</TableHead>
                <TableHead className="text-right sticky right-0 z-10 bg-surface-subtle border-l border-border">
                  {labels.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 40).map((b) => (
                <TableRow key={`${b.store_id}-${b.product_id}`} className="group hover:bg-muted/60">
                  <TableCell>
                    <span className="block truncate text-sm font-medium text-foreground">
                      {b.product_name}
                    </span>
                    <span className="tabular block text-[11px] text-muted-foreground">{b.sku}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.store_name}</TableCell>
                  <TableCell className="tabular text-right text-sm">
                    {formatNumber(b.on_hand, locale)}
                  </TableCell>
                  <TableCell className="tabular hidden text-right text-sm text-muted-foreground md:table-cell">
                    {b.reserved ? formatNumber(b.reserved, locale) : "-"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "tabular text-right text-sm font-medium",
                      b.available <= 0
                        ? "text-danger-strong"
                        : b.low
                          ? "text-warning-strong"
                          : "text-foreground",
                    )}
                  >
                    {formatNumber(b.available, locale)} {b.unit}
                  </TableCell>
                  <TableCell className="tabular hidden text-right text-xs text-muted-foreground sm:table-cell">
                    {formatNumber(b.reorder_point, locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    {b.available <= 0 ? (
                      <Badge variant="danger">{labels.out}</Badge>
                    ) : b.low ? (
                      <Badge variant="warning">{labels.low}</Badge>
                    ) : (
                      <Badge variant="outline">{labels.normal}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right sticky right-0 bg-background group-hover:bg-muted/60 border-l border-border">
                    {b.low ? (
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip label={labels.createPo}>
                          <Button asChild variant="secondary" size="icon">
                            <Link
                              href={`/purchasing?store=${b.store_id}`}
                              aria-label={`${labels.createPo}: ${b.product_name}`}
                            >
                                <Plus className="text-success" />
                            </Link>
                          </Button>
                        </Tooltip>
                        <Tooltip label={labels.viewPricing}>
                          <Button asChild variant="secondary" size="icon">
                            <Link
                              href={`/pricing?store=${b.store_id}`}
                              aria-label={`${labels.viewPricing}: ${b.product_name}`}
                            >
                              <Tag className="text-accent" />
                            </Link>
                          </Button>
                        </Tooltip>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {t.states.emptyTitle}
              </p>
              {hasFilters ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t.states.emptyBody}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setStore("");
                      setFilter("all");
                    }}
                  >
                    {t.common.resetFilter}
                  </Button>
                </>
              ) : null}
            </div>
          ) : (
            <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              {labels.shownOf
                .replace("{shown}", String(Math.min(40, filtered.length)))
                .replace("{total}", String(filtered.length))}
            </p>
          )}
        </div>
      ) : (
        <div
          role="tabpanel"
          id="panel-movements"
          aria-labelledby="tab-movements"
          tabIndex={0}
          className="rounded-lg border border-border"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.when}</TableHead>
                <TableHead>{labels.product}</TableHead>
                <TableHead>{labels.store}</TableHead>
                <TableHead>{labels.reason}</TableHead>
                <TableHead>{labels.ref}</TableHead>
                <TableHead className="text-right">{labels.qty}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMovements.slice(0, 60).map((m) => (
                <TableRow key={m.id} className="hover:bg-muted/60">
                  <TableCell className="tabular whitespace-nowrap text-xs text-muted-foreground">
                    {m.created_at.slice(5, 16).replace("T", " ")}
                  </TableCell>
                  <TableCell>
                    <span className="block truncate text-sm text-foreground">{m.product_name}</span>
                    <span className="tabular block text-[11px] text-muted-foreground">{m.sku}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.store_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.reason}</TableCell>
                  <TableCell className="tabular text-sm text-muted-foreground">{m.ref}</TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        "tabular text-sm font-medium",
                        m.qty > 0 ? "text-success-strong" : "text-danger-strong",
                      )}
                    >
                      {m.qty > 0 ? "+" : ""}
                      {formatNumber(m.qty, locale)} {m.unit}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {visibleMovements.length > 0 ? (
            <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              {labels.shownOf
                .replace("{shown}", String(Math.min(60, visibleMovements.length)))
                .replace("{total}", String(visibleMovements.length))}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}