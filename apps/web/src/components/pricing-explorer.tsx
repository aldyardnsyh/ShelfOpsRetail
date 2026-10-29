"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Bell, Download } from "@/components/icons";
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
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn, linkIdentityClass } from "@/lib/utils";

export interface PriceItem {
  store_id: string;
  store_name: string;
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  price_idr: number;
  cost_idr: number;
  margin_pct: number;
  updated_at: string;
}

export interface Mismatch {
  id: string;
  store_name: string;
  sku: string;
  product_name: string;
  label_price_idr: number;
  price_book_price_idr: number;
  delta_idr: number;
  status: "open" | "resolved";
  alert_id: string;
}

export function PricingExplorer({
  items,
  mismatches,
  stores,
  labels,
}: {
  items: PriceItem[];
  mismatches: Mismatch[];
  stores: { id: string; name: string }[];
  labels: {
    tabBooks: string;
    tabMismatch: string;
    search: string;
    searchPlaceholder: string;
    storeFilter: string;
    product: string;
    store: string;
    price: string;
    cost: string;
    margin: string;
    status: string;
    bookActive: string;
    labelPrice: string;
    bookPrice: string;
    delta: string;
    alert: string;
    open: string;
    resolved: string;
    emptyBooksTitle: string;
    emptyBooksBody: string;
    emptyFilteredTitle: string;
    emptyFilteredBody: string;
    emptyMismatchTitle: string;
    emptyMismatchBody: string;
    shownOf: string;
    exportCta: string;
    exportNote: string;
    openAlert: string;
  };
}) {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"books" | "mismatch">("books");
  const [query, setQuery] = useState("");
  const [store, setStore] = useState(searchParams.get("store") ?? "");

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStore = !store || item.store_id === store;
      const matchesQuery =
        !needle ||
        item.product_name.toLowerCase().includes(needle) ||
        item.sku.toLowerCase().includes(needle) ||
        item.store_name.toLowerCase().includes(needle);
      return matchesStore && matchesQuery;
    });
  }, [items, query, store]);

  const filteredMismatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return mismatches.filter((row) => {
      const matchesStore =
        !store || stores.find((s) => s.id === store)?.name === row.store_name;
      const matchesQuery =
        !needle ||
        row.product_name.toLowerCase().includes(needle) ||
        row.sku.toLowerCase().includes(needle) ||
        row.store_name.toLowerCase().includes(needle);
      return matchesStore && matchesQuery;
    });
  }, [mismatches, query, store, stores]);

  function exportCsv() {
    const rows =
      tab === "books"
        ? [
            ["SKU", "Produk", "Toko", "Harga jual", "Harga pokok", "Margin %"],
            ...filteredItems.map((item) => [
              item.sku,
              item.product_name,
              item.store_name,
              String(item.price_idr),
              String(item.cost_idr),
              String(item.margin_pct),
            ]),
          ]
        : [
            ["Produk", "SKU", "Toko", "Harga label", "Harga price book", "Selisih", "Status"],
            ...filteredMismatches.map((row) => [
              row.product_name,
              row.sku,
              row.store_name,
              String(row.label_price_idr),
              String(row.price_book_price_idr),
              String(row.delta_idr),
              row.status,
            ]),
          ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = tab === "books" ? "ShelfOpsRetail-price-book.csv" : "ShelfOpsRetail-price-mismatch.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

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
            <Label htmlFor="pricing-search">{labels.search}</Label>
            <Input
              id="pricing-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchPlaceholder}
            />
          </div>
          <div className="w-full space-y-1.5 sm:max-w-56">
            <Label htmlFor="pricing-store">{labels.storeFilter}</Label>
            <select
              id="pricing-store"
              value={store}
              onChange={(event) => setStore(event.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
            >
              <option value="">{t.common.all}</option>
              {stores.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={exportCsv}>
          <Download />
          {labels.exportCta}
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b border-border" role="tablist">
        <button
          type="button"
          role="tab"
          id="tab-books"
          aria-selected={tab === "books"}
          onClick={() => setTab("books")}
          className={tabClass(tab === "books")}
        >
          {labels.tabBooks} ({formatNumber(items.length, locale)})
        </button>
        <button
          type="button"
          role="tab"
          id="tab-mismatch"
          aria-selected={tab === "mismatch"}
          onClick={() => setTab("mismatch")}
          className={tabClass(tab === "mismatch")}
        >
          {labels.tabMismatch} ({formatNumber(mismatches.length, locale)})
        </button>
      </div>

      {tab === "books" ? (
        <div
          role="tabpanel"
          id="panel-books"
          aria-labelledby="tab-books"
          tabIndex={0}
          className="rounded-lg border border-border"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.product}</TableHead>
                <TableHead className="hidden md:table-cell">{labels.store}</TableHead>
                <TableHead className="text-right">{labels.price}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{labels.cost}</TableHead>
                <TableHead className="text-right">{labels.margin}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.slice(0, 40).map((item) => (
                <TableRow key={`${item.store_id}-${item.product_id}`} className="hover:bg-muted/60">
                  <TableCell>
                    <span className="block max-w-[20rem] truncate text-sm font-medium text-foreground" title={item.product_name}>
                      {item.product_name}
                    </span>
                    <span className="tabular block text-[11px] text-muted-foreground">{item.sku}</span>
                  </TableCell>
                  <TableCell className="hidden max-w-[15rem] truncate text-sm text-muted-foreground md:table-cell" title={item.store_name}>
                    {item.store_name}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right text-sm">
                    Rp {formatNumber(item.price_idr, locale)}
                  </TableCell>
                  <TableCell className="tabular hidden whitespace-nowrap text-right text-sm text-muted-foreground sm:table-cell">
                    Rp {formatNumber(item.cost_idr, locale)}
                  </TableCell>
                  <TableCell className="tabular text-right text-sm">
                    {item.margin_pct.toFixed(1)}%
                  </TableCell>

                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {query || store ? labels.emptyFilteredTitle : labels.emptyBooksTitle}
              </p>
              <p className="text-sm text-muted-foreground">
                {query || store ? labels.emptyFilteredBody : labels.emptyBooksBody}
              </p>
              {query || store ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => { setQuery(""); setStore(""); }}>
                  {t.common.resetFilter}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              {labels.shownOf
                .replace("{shown}", String(Math.min(40, filteredItems.length)))
                .replace("{total}", String(filteredItems.length))}
            </p>
          )}
        </div>
      ) : (
        <div
          role="tabpanel"
          id="panel-mismatch"
          aria-labelledby="tab-mismatch"
          tabIndex={0}
          className="rounded-lg border border-border"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.product}</TableHead>
                <TableHead className="hidden md:table-cell">{labels.store}</TableHead>
                <TableHead className="text-right">{labels.labelPrice}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{labels.bookPrice}</TableHead>
                <TableHead className="text-right">{labels.delta}</TableHead>
                <TableHead className="text-right">{labels.status}</TableHead>
                <TableHead className="w-16 whitespace-nowrap text-right sticky right-0 z-10 bg-surface-subtle border-l border-border">
                  {t.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMismatches.slice(0, 40).map((row) => (
                <TableRow key={row.id} className="group hover:bg-muted/60">
                  <TableCell className="min-w-44">
                    <span
                      className={cn("block max-w-[20rem] truncate text-sm", linkIdentityClass)}
                      title={row.product_name}
                    >
                      {row.product_name}
                    </span>
                    <span className="tabular block text-[11px] text-muted-foreground">{row.sku}</span>
                  </TableCell>
                  <TableCell className="hidden max-w-[15rem] truncate text-sm text-muted-foreground md:table-cell" title={row.store_name}>
                    {row.store_name}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right text-sm">
                    Rp {formatNumber(row.label_price_idr, locale)}
                  </TableCell>
                  <TableCell className="tabular hidden whitespace-nowrap text-right text-sm text-muted-foreground sm:table-cell">
                    Rp {formatNumber(row.price_book_price_idr, locale)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "tabular whitespace-nowrap text-right text-sm font-medium",
                      row.delta_idr < 0 ? "text-danger-strong" : "text-warning-strong",
                    )}
                  >
                    {row.delta_idr > 0 ? "+" : ""}
                    Rp {formatNumber(Math.abs(row.delta_idr), locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.status === "open" ? (
                      <Badge variant="warning">{labels.open}</Badge>
                    ) : (
                      <Badge variant="success">{labels.resolved}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right sticky right-0 bg-background group-hover:bg-muted/60 border-l border-border">
                    <Tooltip label={labels.openAlert}>
                      <Button asChild variant="secondary" size="icon">
                        <Link
                          href={`/alerts?alert=${row.alert_id}`}
                          aria-label={`${labels.openAlert}: ${row.product_name}`}
                        >
                          <Bell className="text-warning-strong" />
                        </Link>
                      </Button>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredMismatches.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {query || store ? labels.emptyFilteredTitle : labels.emptyMismatchTitle}
              </p>
              <p className="text-sm text-muted-foreground">
                {query || store ? labels.emptyFilteredBody : labels.emptyMismatchBody}
              </p>
              {query || store ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => { setQuery(""); setStore(""); }}>
                  {t.common.resetFilter}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{labels.exportNote}</p>
    </div>
  );
}
