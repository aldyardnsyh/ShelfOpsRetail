import type { Metadata } from "next";

import { ErrorState } from "@/components/error-state";
import { InventoryExplorer } from "@/components/inventory-explorer";
import { PageHeader } from "@/components/page-header";
import { formatNumber } from "@/lib/format";
import { getInventory } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { KpiStrip } from "@/components/ui/kpi-strip";

export const metadata: Metadata = {
  title: "Inventori",
};

type InventoryPayload = {
  summary: {
    stock_value_idr: number;
    low_stock_count: number;
    out_of_stock_count: number;
    movement_count: number;
  };
  locations: { id: string; store_id: string; name: string; kind: string }[];
  balances: { store_id: string; store_name: string }[];
  movements: unknown[];
};

export default async function InventoryPage() {
  const { t, locale } = await getI18n();
  const res = await getInventory();
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t.inventory.title}
          description={t.inventory.subtitle}
          meta={<p className="text-xs text-muted-foreground">{t.inventory.meta}</p>}
        />
        <ErrorState error={res.error} />
      </div>
    );
  }
  const data = res.data as unknown as InventoryPayload;
  const s = data.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.inventory.title}
        description={t.inventory.subtitle}
        meta={
          <p className="text-xs text-muted-foreground">{t.inventory.meta}</p>
        }
      />

      <KpiStrip
        items={[

{
  label: t.inventory.kpiValue,
  value: `Rp ${formatNumber(Math.round(s.stock_value_idr / 1_000_000), locale)} jt`,
},
{
  label: t.inventory.kpiLow,
  value: formatNumber(s.low_stock_count, locale),
  tone: "warning",
},
{
  label: t.inventory.kpiOut,
  value: formatNumber(s.out_of_stock_count, locale),
  tone: s.out_of_stock_count > 0 ? "danger" : "normal",
},
{
  label: t.inventory.kpiMovement,
  value: `${formatNumber(s.movement_count, locale)} ${t.inventory.last7Days}`,
},
        ]}
      />

      <InventoryExplorer
        balances={data.balances as any}
        movements={data.movements as any}
        stores={data.locations
          .map((l) => ({ id: l.store_id, name: l.store_id }))
          .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i)
          .map((v) => {
            const name = data.balances.find((b) => b.store_id === v.id)?.store_name ?? v.id;
            return { id: v.id, name };
          })}
        labels={{
          title: t.inventory.stockTitle,
          product: t.inventory.product,
          store: t.inventory.store,
          onHand: t.inventory.onHand,
          reserved: t.inventory.reserved,
          available: t.inventory.available,
          reorder: t.inventory.reorder,
          status: t.inventory.status,
          actions: t.common.actions,
          movementsTitle: t.inventory.movementsTitle,
          filterAll: t.inventory.filterAll,
          filterLow: t.inventory.filterLow,
          filterOut: t.inventory.filterOut,
          filterHealthy: t.inventory.filterHealthy,
          shownOf: t.inventory.shownOf,
          search: t.common.search,
          searchPlaceholder: t.inventory.searchPlaceholder,
          normal: t.inventory.normal,
          low: t.inventory.low,
          out: t.inventory.out,
          qty: t.inventory.qty,
          reason: t.inventory.reason,
          ref: t.inventory.ref,
          when: t.inventory.when,
          createPo: t.inventory.createPo,
          viewPricing: t.inventory.viewPricing,
        }}
      />
    </div>
  );
}