"use client";

import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ChevronDown, Plus, Truck } from "@/components/icons";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export interface PurchaseOrderLine {
  product_id: string;
  sku: string;
  product_name: string;
  qty: number;
  unit_cost_idr: number;
}

export interface PurchaseOrder {
  id: string;
  po_code?: string;
  supplier_id: string;
  supplier_name: string;
  store_id: string;
  store_name: string;
  status: string;
  created_at: string;
  expected_at: string;
  lines: PurchaseOrderLine[];
  total_idr: number;
  note?: string;
}

export interface Grn {
  id: string;
  ref: string;
  po_id: string;
  store_name: string;
  supplier_name: string;
  received_at: string;
  qty: number;
  value_idr: number;
  status: string;
}

export interface Supplier {
  id: string;
  name: string;
  category: string;
  lead_time_days: number;
  on_time_pct: number;
}

const PO_STATUS_VARIANT: Record<string, "neutral" | "accent" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  sent: "accent",
  partially_received: "warning",
  received: "success",
  overdue: "danger",
};

export function PurchasingView({
  orders: initialOrders,
  grns,
  suppliers,
  stores,
  labels,
}: {
  orders: PurchaseOrder[];
  grns: Grn[];
  suppliers: Supplier[];
  stores: { id: string; name: string }[];
  labels: {
    tabOrders: string;
    tabReceipts: string;
    tabSuppliers: string;
    search: string;
    searchPlaceholder: string;
    allStatuses: string;
    orderNo: string;
    supplier: string;
    store: string;
    lines: string;
    total: string;
    expected: string;
    status: string;
    detail: string;
    detailTitle: string;
    item: string;
    qty: string;
    unitCost: string;
    subtotal: string;
    close: string;
    receiptNo: string;
    poRef: string;
    receivedAt: string;
    receivedQty: string;
    value: string;
    supplierName: string;
    category: string;
    leadTime: string;
    onTime: string;
    days: string;
    statuses: Record<string, string>;
    receiptStatuses: Record<string, string>;
    emptyOrdersTitle: string;
    emptyOrdersBody: string;
    emptyFilteredTitle: string;
    emptyFilteredBody: string;
    emptyReceiptsTitle: string;
    emptyReceiptsBody: string;
    emptySuppliersTitle: string;
    emptySuppliersBody: string;
    newPo: string;
    newPoTitle: string;
    newPoBody: string;
    newPoSupplier: string;
    newPoStore: string;
    newPoExpected: string;
    newPoSubmit: string;
    newPoSuccess: string;
  };
}) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialStoreFilter = searchParams.get("store") ?? "";
  const [orders, setOrders] = useState(initialOrders);
  const [tab, setTab] = useState<"orders" | "receipts" | "suppliers">("orders");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [storeFilter, setStoreFilter] = useState(initialStoreFilter);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState(suppliers[0]?.id ?? "");
  const [store, setStore] = useState(stores[0]?.id ?? "");
  const [expected, setExpected] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  );

  const needle = query.trim().toLowerCase();

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const matchesStatus = !status || order.status === status;
        const matchesStore = !storeFilter || order.store_id === storeFilter;
        const matchesQuery =
          !needle ||
          order.id.toLowerCase().includes(needle) ||
          (order.po_code ?? "").toLowerCase().includes(needle) ||
          order.supplier_name.toLowerCase().includes(needle) ||
          order.store_name.toLowerCase().includes(needle);
        return matchesStatus && matchesStore && matchesQuery;
      }),
    [orders, status, storeFilter, needle],
  );

  const filteredGrns = useMemo(
    () =>
      grns.filter((grn) => {
        return (
          !needle ||
          grn.ref.toLowerCase().includes(needle) ||
          grn.po_id.toLowerCase().includes(needle) ||
          grn.store_name.toLowerCase().includes(needle) ||
          grn.supplier_name.toLowerCase().includes(needle)
        );
      }),
    [grns, needle],
  );

  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter(
        (item) =>
          !needle ||
          item.name.toLowerCase().includes(needle) ||
          item.category.toLowerCase().includes(needle),
      ),
    [suppliers, needle],
  );

  function createOrder() {
    const chosenSupplier = suppliers.find((item) => item.id === supplier);
    const chosenStore = stores.find((item) => item.id === store);
    if (!chosenSupplier || !chosenStore) return;
    const line = {
      product_id: "P-0001",
      sku: "SKU-0001",
      product_name: t.purchasing.draftLabel,
      qty: 120,
      unit_cost_idr: 6620,
    };
    setOrders((current) => [
      {
        id: crypto.randomUUID(),
        po_code: `PO-${new Date().getFullYear()}-${1001 + current.length}`,
        supplier_id: chosenSupplier.id,
        supplier_name: chosenSupplier.name,
        store_id: chosenStore.id,
        store_name: chosenStore.name,
        status: "draft",
        created_at: new Date().toISOString(),
        expected_at: `${expected}T17:00:00+07:00`,
        lines: [line],
        total_idr: line.qty * line.unit_cost_idr,
        note: labels.newPoBody,
      },
      ...current,
    ]);
    setOpen(false);
    setTab("orders");
    toast({ title: labels.newPoSuccess, variant: "success" });
  }

  const hasFilters = Boolean(query || status || storeFilter);

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
            <Label htmlFor="po-search">{labels.search}</Label>
            <Input
              id="po-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchPlaceholder}
            />
          </div>
          {tab === "orders" ? (
            <div className="w-full space-y-1.5 sm:max-w-48">
              <Label htmlFor="po-status">{labels.status}</Label>
              <select
                id="po-status"
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
          ) : null}
          {tab === "orders" ? (
            <div className="w-full space-y-1.5 sm:max-w-56">
              <Label htmlFor="po-store-filter">{labels.store}</Label>
              <select
                id="po-store-filter"
                value={storeFilter}
                onChange={(event) => setStoreFilter(event.target.value)}
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
          ) : null}
        </div>
        {tab === "orders" ? (
          <div className="flex items-center gap-2">
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setStatus("");
                  setStoreFilter("");
                }}
              >
                {t.common.resetFilter}
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              <Plus />
              {labels.newPo}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1 border-b border-border" role="tablist">
        <button
          type="button"
          role="tab"
          id="tab-orders"
          aria-selected={tab === "orders"}
          onClick={() => setTab("orders")}
          className={tabClass(tab === "orders")}
        >
          {labels.tabOrders} ({formatNumber(orders.length, locale)})
        </button>
        <button
          type="button"
          role="tab"
          id="tab-receipts"
          aria-selected={tab === "receipts"}
          onClick={() => setTab("receipts")}
          className={tabClass(tab === "receipts")}
        >
          {labels.tabReceipts} ({formatNumber(grns.length, locale)})
        </button>
        <button
          type="button"
          role="tab"
          id="tab-suppliers"
          aria-selected={tab === "suppliers"}
          onClick={() => setTab("suppliers")}
          className={tabClass(tab === "suppliers")}
        >
          {labels.tabSuppliers} ({formatNumber(suppliers.length, locale)})
        </button>
      </div>

      {tab === "orders" ? (
        <div
          role="tabpanel"
          id="panel-orders"
          aria-labelledby="tab-orders"
          tabIndex={0}
          className="rounded-lg border border-border"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.orderNo}</TableHead>
                <TableHead className="hidden md:table-cell">{labels.supplier}</TableHead>
                <TableHead className="hidden lg:table-cell">{labels.store}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{labels.total}</TableHead>
                <TableHead className="hidden whitespace-nowrap lg:table-cell">{labels.expected}</TableHead>
                <TableHead className="text-right">{labels.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => {
                const openRow = expanded === order.id;
                return (
                  <Fragment key={order.id}>
                    <TableRow className="hover:bg-muted/60">
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setExpanded(openRow ? null : order.id)}
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
                            <span className="tabular block text-sm font-medium text-foreground">{order.po_code ?? order.id}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {formatNumber(order.lines.length, locale)} {labels.lines}
                            </span>
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="hidden max-w-[16rem] truncate text-sm text-muted-foreground md:table-cell" title={order.supplier_name}>
                        {order.supplier_name}
                      </TableCell>
                      <TableCell className="hidden max-w-[15rem] truncate text-sm text-muted-foreground lg:table-cell" title={order.store_name}>
                        {order.store_name}
                      </TableCell>
                      <TableCell className="tabular hidden whitespace-nowrap text-right text-sm sm:table-cell">
                        Rp {formatNumber(order.total_idr, locale)}
                      </TableCell>
                      <TableCell className="tabular hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                        {order.expected_at.slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={PO_STATUS_VARIANT[order.status] ?? "neutral"}>
                          {labels.statuses[order.status] ?? order.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {openRow ? (
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={6} className="align-top">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {labels.detailTitle}
                          </p>
                          <table className="mt-2 w-full text-sm">
                            <thead>
                              <tr className="text-left text-[11px] text-muted-foreground">
                                <th className="py-1 font-medium">{labels.item}</th>
                                <th className="py-1 text-right font-medium">{labels.qty}</th>
                                <th className="py-1 text-right font-medium">{labels.unitCost}</th>
                                <th className="py-1 text-right font-medium">{labels.subtotal}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.lines.map((line) => (
                                <tr key={line.product_id} className="border-t border-border/70">
                                  <td className="py-1.5">
                                    <span className="block text-foreground">{line.product_name}</span>
                                    <span className="tabular block text-[11px] text-muted-foreground">{line.sku}</span>
                                  </td>
                                  <td className="tabular py-1.5 text-right">{formatNumber(line.qty, locale)}</td>
                                  <td className="tabular py-1.5 text-right">Rp {formatNumber(line.unit_cost_idr, locale)}</td>
                                  <td className="tabular py-1.5 text-right">
                                    Rp {formatNumber(line.qty * line.unit_cost_idr, locale)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {order.note ? (
                            <p className="mt-2 text-[11px] text-muted-foreground">{order.note}</p>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {hasFilters ? labels.emptyFilteredTitle : labels.emptyOrdersTitle}
              </p>
              <p className="text-sm text-muted-foreground">
                {hasFilters ? labels.emptyFilteredBody : labels.emptyOrdersBody}
              </p>
              {hasFilters ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setStatus("");
                    setStoreFilter("");
                  }}
                >
                  {t.common.resetFilter}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "receipts" ? (
        <div
          role="tabpanel"
          id="panel-receipts"
          aria-labelledby="tab-receipts"
          tabIndex={0}
          className="rounded-lg border border-border"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.receiptNo}</TableHead>
                <TableHead className="hidden md:table-cell">{labels.poRef}</TableHead>
                <TableHead className="hidden lg:table-cell">{labels.store}</TableHead>
                <TableHead className="hidden sm:table-cell">{labels.receivedAt}</TableHead>
                <TableHead className="text-right">{labels.receivedQty}</TableHead>
                <TableHead className="hidden text-right md:table-cell">{labels.value}</TableHead>
                <TableHead className="text-right">{labels.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGrns.map((grn) => (
                <TableRow key={grn.id} className="hover:bg-muted/60">
                  <TableCell>
                    <span className="tabular block text-sm font-medium text-foreground">{grn.ref}</span>
                    <span className="block text-[11px] text-muted-foreground">{grn.supplier_name}</span>
                  </TableCell>
                  <TableCell className="tabular hidden text-sm text-muted-foreground md:table-cell">
                    {grn.po_id}
                  </TableCell>
                  <TableCell className="hidden max-w-[16rem] truncate text-sm text-muted-foreground lg:table-cell" title={grn.store_name}>
                    {grn.store_name}
                  </TableCell>
                  <TableCell className="tabular hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell">
                    {grn.received_at.slice(0, 10)}
                  </TableCell>
                  <TableCell className="tabular text-right text-sm">
                    {formatNumber(grn.qty, locale)}
                  </TableCell>
                  <TableCell className="tabular hidden whitespace-nowrap text-right text-sm md:table-cell">
                    Rp {formatNumber(grn.value_idr, locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={grn.status === "posted" ? "success" : "warning"}>
                      {labels.receiptStatuses[grn.status] ?? grn.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredGrns.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {needle ? labels.emptyFilteredTitle : labels.emptyReceiptsTitle}
              </p>
              <p className="text-sm text-muted-foreground">
                {needle ? labels.emptyFilteredBody : labels.emptyReceiptsBody}
              </p>
              {needle ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setQuery("")}>
                  {t.common.resetFilter}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "suppliers" ? (
        <div
          role="tabpanel"
          id="panel-suppliers"
          aria-labelledby="tab-suppliers"
          tabIndex={0}
          className="rounded-lg border border-border"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.supplierName}</TableHead>
                <TableHead className="hidden sm:table-cell">{labels.category}</TableHead>
                <TableHead className="text-right">{labels.leadTime}</TableHead>
                <TableHead className="text-right">{labels.onTime}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/60">
                  <TableCell>
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Truck className="size-4 text-muted-foreground" />
                      {item.name}
                    </span>
                    <span className="tabular block text-[11px] text-muted-foreground">{item.id}</span>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {item.category}
                  </TableCell>
                  <TableCell className="tabular text-right text-sm">
                    {formatNumber(item.lead_time_days, locale)} {labels.days}
                  </TableCell>
                  <TableCell className="tabular text-right text-sm font-medium">
                    {item.on_time_pct.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredSuppliers.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {labels.emptySuppliersTitle}. {labels.emptySuppliersBody}
            </p>
          ) : null}
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.newPoTitle}</DialogTitle>
            <DialogDescription>{labels.newPoBody}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="po-supplier">{labels.newPoSupplier}</Label>
              <select
                id="po-supplier"
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
              >
                {suppliers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-store">{labels.newPoStore}</Label>
              <select
                id="po-store"
                value={store}
                onChange={(event) => setStore(event.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
              >
                {stores.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-expected">{labels.newPoExpected}</Label>
              <Input
                id="po-expected"
                type="date"
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {labels.close}
            </Button>
            <Button type="button" onClick={createOrder}>
              {labels.newPoSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">{t.purchasing.note}</p>
    </div>
  );
}
