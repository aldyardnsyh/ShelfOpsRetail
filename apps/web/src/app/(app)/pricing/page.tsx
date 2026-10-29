import type { Metadata } from "next";
import { Suspense } from "react";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import {
  PricingExplorer,
  type Mismatch,
  type PriceItem,
} from "@/components/pricing-explorer";
import { formatNumber } from "@/lib/format";
import { getPricing } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { KpiStrip } from "@/components/ui/kpi-strip";

// PricingPayload adalah bentuk /api/v1/pricing (summary, price_books, items, mismatches).
type PricingPayload = {
  summary: {
    price_books_active: number;
    items_count: number;
    mismatch_open: number;
    mismatch_total: number;
    avg_margin_pct: number | null;
    stores_covered: number;
  };
  price_books: unknown[];
  items: PriceItem[];
  mismatches: Mismatch[];
};

export const metadata: Metadata = {
  title: "Harga",
};

export default async function PricingPage() {
  const { t, locale } = await getI18n();
  const res = await getPricing();
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t.pricing.title}
          description={t.pricing.subtitle}
          meta={<p className="text-xs text-muted-foreground">{t.pricing.meta}</p>}
        />
        <ErrorState error={res.error} />
      </div>
    );
  }
  const data = res.data as unknown as PricingPayload;

  const stores: { id: string; name: string }[] = Array.isArray(
    (data as PricingPayload).price_books,
  )
    ? (data.price_books as { store_id: string; store_name: string }[]).map((book) => ({
        id: book.store_id,
        name: book.store_name,
      }))
    : [];

  const s = data.summary;
  const avgMargin = typeof s.avg_margin_pct === "number" ? s.avg_margin_pct : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.pricing.title}
        description={t.pricing.subtitle}
        meta={<p className="text-xs text-muted-foreground">{t.pricing.meta}</p>}
      />

      <KpiStrip
        items={[

{
  label: t.pricing.kpiBooks,
  value: formatNumber(s.price_books_active, locale),
  hint: `${formatNumber(s.stores_covered, locale)} ${t.nav.stores.toLowerCase()}`,
},
{
  label: t.pricing.kpiItems,
  value: formatNumber(s.items_count, locale),
  hint: t.pricing.tabBooks,
},
{
  label: t.pricing.kpiMismatch,
  value: formatNumber(s.mismatch_open, locale),
  hint: `${formatNumber(s.mismatch_total, locale)} ${t.pricing.tabMismatch.toLowerCase()}`,
  tone: s.mismatch_open > 0 ? "warning" : "normal",
},
{
  label: t.pricing.kpiMargin,
  value: `${avgMargin.toFixed(1)}%`,
  hint: t.pricing.margin,
},
        ]}
      />

      <Suspense fallback={null}>
        <PricingExplorer
        items={data.items as unknown as PriceItem[]}
        mismatches={data.mismatches as unknown as Mismatch[]}
        stores={stores}
        labels={{
          tabBooks: t.pricing.tabBooks,
          tabMismatch: t.pricing.tabMismatch,
          search: t.common.search,
          searchPlaceholder: t.pricing.searchPlaceholder,
          storeFilter: t.pricing.storeFilter,
          product: t.pricing.product,
          store: t.pricing.store,
          price: t.pricing.price,
          cost: t.pricing.cost,
          margin: t.pricing.margin,
          status: t.pricing.status,
          bookActive: t.pricing.bookActive,
          labelPrice: t.pricing.labelPrice,
          bookPrice: t.pricing.bookPrice,
          delta: t.pricing.delta,
          alert: t.pricing.alert,
          open: t.pricing.open,
          resolved: t.pricing.resolved,
          emptyFilteredTitle: t.pricing.emptyFilteredTitle,
          emptyFilteredBody: t.pricing.emptyFilteredBody,
          emptyBooksTitle: t.pricing.emptyBooksTitle,
          emptyBooksBody: t.pricing.emptyBooksBody,
          emptyMismatchTitle: t.pricing.emptyMismatchTitle,
          emptyMismatchBody: t.pricing.emptyMismatchBody,
          shownOf: t.pricing.shownOf,
          exportCta: t.pricing.exportCta,
          exportNote: t.pricing.exportNote,
          openAlert: t.pricing.openAlert,
        }}
        />
      </Suspense>

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        {t.pricing.note}
      </p>
    </div>
  );
}
