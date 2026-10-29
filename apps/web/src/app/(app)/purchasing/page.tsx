import type { Metadata } from "next";
import { Suspense } from "react";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { PurchasingWritePanel } from "@/components/purchasing-write-panel";
import {
  PurchasingView,
  type Grn,
  type PurchaseOrder,
  type Supplier,
} from "@/components/purchasing-view";
import { formatNumber } from "@/lib/format";
import { getInventory, getPurchasing } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { KpiStrip } from "@/components/ui/kpi-strip";

// PurchasingSummary adalah bentuk /api/v1/purchasing (summary, suppliers, purchase_orders, grns).
type PurchasingSummary = {
  suppliers_active: number;
  pos_open: number;
  pos_total: number;
  value_open_idr: number;
  late_count: number;
  received_count: number;
};

type PurchasingPayload = {
  summary: PurchasingSummary;
  suppliers: Supplier[];
  purchase_orders: PurchaseOrder[];
  grns: Grn[];
};

export const metadata: Metadata = {
  title: "Pengadaan",
};

export default async function PurchasingPage() {
  const { t, locale } = await getI18n();
  const res = await getPurchasing();
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t.purchasing.title}
          description={t.purchasing.subtitle}
          meta={<p className="text-xs text-muted-foreground">{t.purchasing.meta}</p>}
        />
        <ErrorState error={res.error} />
      </div>
    );
  }
  const data = res.data as unknown as PurchasingPayload;
  const s = data.summary;

  const stores = data.purchase_orders
    .map((order) => ({ id: order.store_id, name: order.store_name }))
    .filter((value, index, list) => list.findIndex((item) => item.id === value.id) === index);

  // Produk diambil dari inventori: dipakai form pembuatan PO.
  const inventoryRes = await getInventory();
  const products = inventoryRes.ok
    ? ((inventoryRes.data as { products?: { id: string; sku: string; name: string }[] }).products ?? [])
    : [];

  // Baris PO yang masih bisa diterima (qty_received < qty_order).
  const openOrders = data.purchase_orders
    .filter((order) => order.status !== "received" && order.status !== "cancelled")
    .map((order) => ({
      id: order.id,
      code: order.po_code ?? order.id,
      lines: ((order.lines ?? []) as { po_line_id?: string; sku?: string; qty_order?: number; qty_received?: number }[])
        .filter((line) => line.po_line_id)
        .map((line) => ({
          po_line_id: line.po_line_id as string,
          sku: line.sku ?? "",
          qty_order: line.qty_order ?? 0,
          qty_received: line.qty_received ?? 0,
        })),
    }))
    .filter((order) => order.lines.some((line) => line.qty_received < line.qty_order));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.purchasing.title}
        description={t.purchasing.subtitle}
        meta={<p className="text-xs text-muted-foreground">{t.purchasing.meta}</p>}
      />

      <KpiStrip
        items={[

{
  label: t.purchasing.kpiOpen,
  value: formatNumber(s.pos_open, locale),
  hint: t.purchasing.hintDraftPos.replace("{count}", formatNumber(s.pos_total - s.pos_open, locale)),
},
{
  label: t.purchasing.kpiWaiting,
  value: formatNumber(s.pos_open, locale),
  hint: t.purchasing.tabReceipts,
},
{
  label: t.purchasing.kpiOverdue,
  value: formatNumber(s.late_count, locale),
  hint: t.purchasing.hintOpenPos
    .replace("{count}", formatNumber(s.pos_open, locale))
    .replace("{pct}", "0"),
  tone: s.late_count > 0 ? "danger" : "normal",
},
{
  label: t.purchasing.kpiSpend,
  value: `Rp ${formatNumber(Math.round(s.value_open_idr / 1_000_000), locale)} jt`,
  hint: t.purchasing.hintReceived.replace("{count}", formatNumber(s.received_count, locale)),
},
        ]}
      />

      <PurchasingWritePanel
        stores={stores.map((store) => ({ id: store.id, label: store.name }))}
        suppliers={data.suppliers.map((supplier) => ({ id: supplier.id, label: supplier.name }))}
        products={products.map((product) => ({ id: product.id, label: `${product.sku} Ã‚Â· ${product.name}` }))}
        orders={openOrders}
      />

      <Suspense fallback={null}>
        <PurchasingView
        orders={data.purchase_orders as unknown as PurchaseOrder[]}
        grns={data.grns as unknown as Grn[]}
        suppliers={data.suppliers as unknown as Supplier[]}
        stores={stores}
        labels={{
          tabOrders: t.purchasing.tabOrders,
          tabReceipts: t.purchasing.tabReceipts,
          tabSuppliers: t.purchasing.tabSuppliers,
          search: t.common.search,
          searchPlaceholder: t.purchasing.searchPlaceholder,
          allStatuses: t.purchasing.allStatuses,
          orderNo: t.purchasing.orderNo,
          supplier: t.purchasing.supplier,
          store: t.purchasing.store,
          lines: t.purchasing.lines,
          total: t.purchasing.total,
          expected: t.purchasing.expected,
          status: t.purchasing.status,
          detail: t.purchasing.detail,
          detailTitle: t.purchasing.detailTitle,
          item: t.purchasing.item,
          qty: t.purchasing.qty,
          unitCost: t.purchasing.unitCost,
          subtotal: t.purchasing.subtotal,
          close: t.purchasing.close,
          receiptNo: t.purchasing.receiptNo,
          poRef: t.purchasing.poRef,
          receivedAt: t.purchasing.receivedAt,
          receivedQty: t.purchasing.receivedQty,
          value: t.purchasing.value,
          supplierName: t.purchasing.supplierName,
          category: t.purchasing.category,
          leadTime: t.purchasing.leadTime,
          onTime: t.purchasing.onTime,
          days: t.purchasing.days,
          statuses: t.purchasing.statuses,
          receiptStatuses: t.purchasing.receiptStatuses,
          emptyOrdersTitle: t.purchasing.emptyOrdersTitle,
          emptyOrdersBody: t.purchasing.emptyOrdersBody,
          emptyFilteredTitle: t.purchasing.emptyFilteredTitle,
          emptyFilteredBody: t.purchasing.emptyFilteredBody,
          emptyReceiptsTitle: t.purchasing.emptyReceiptsTitle,
          emptyReceiptsBody: t.purchasing.emptyReceiptsBody,
          emptySuppliersTitle: t.purchasing.emptySuppliersTitle,
          emptySuppliersBody: t.purchasing.emptySuppliersBody,
          newPo: t.purchasing.newPo,
          newPoTitle: t.purchasing.newPoTitle,
          newPoBody: t.purchasing.newPoBody,
          newPoSupplier: t.purchasing.newPoSupplier,
          newPoStore: t.purchasing.newPoStore,
          newPoExpected: t.purchasing.newPoExpected,
          newPoSubmit: t.purchasing.newPoSubmit,
          newPoSuccess: t.purchasing.newPoSuccess,
        }}
        />
      </Suspense>

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        {t.purchasing.note}
      </p>
    </div>
  );
}
