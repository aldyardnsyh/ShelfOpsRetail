import type { Metadata } from "next";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { TrackingView, type Shipment } from "@/components/tracking-view";
import { getTracking } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { KpiStrip } from "@/components/ui/kpi-strip";

export const metadata: Metadata = {
  title: "Pelacakan Pengiriman",
};

export default async function TrackingPage() {
  const { t, locale } = await getI18n();
  const res = await getTracking();
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t.tracking.title}
          description={t.tracking.subtitle}
          meta={<p className="text-xs text-muted-foreground">{t.tracking.meta}</p>}
        />
        <ErrorState error={res.error} />
      </div>
    );
  }
  const data = (res.data as { items: unknown[] }).items as unknown as Shipment[];

  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());
  const inTransit = data.filter(
    (item) => item.status === "in_transit" || item.status === "at_hub" || item.status === "out_for_delivery",
  ).length;
  const delayed = data.filter((item) => item.status === "delayed").length;
  const arrivingToday = data.filter((item) => item.eta.slice(0, 10) === todayIso).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.tracking.title}
        description={t.tracking.subtitle}
        meta={<p className="text-xs text-muted-foreground">{t.tracking.meta}</p>}
      />

      <KpiStrip
        items={[
          {
            label: t.tracking.kpiInTransit,
            value: new Intl.NumberFormat(locale).format(inTransit),
            hint: t.tracking.kpiInTransitHint,
          },
          {
            label: t.tracking.kpiDelayed,
            value: new Intl.NumberFormat(locale).format(delayed),
            hint: t.tracking.kpiDelayedHint,
            tone: delayed > 0 ? "danger" : "normal",
          },
          {
            label: t.tracking.kpiToday,
            value: new Intl.NumberFormat(locale).format(arrivingToday),
            hint: t.tracking.kpiTodayHint,
          },
        ]}
      />

      <TrackingView
        shipments={data}
        labels={{
          search: t.common.search,
          searchPlaceholder: t.tracking.searchPlaceholder,
          allStatuses: t.tracking.allStatuses,
          statuses: t.tracking.statuses,
          timelineSteps: t.tracking.timelineSteps,
          carrier: t.tracking.carrier,
          destination: t.tracking.destination,
          eta: t.tracking.eta,
          progress: t.tracking.progress,
          shipment: t.tracking.shipment,
          poRef: t.tracking.poRef,
          items: t.tracking.items,
          lastUpdate: t.tracking.lastUpdate,
          coldChain: t.tracking.coldChain,
          tempOk: t.tracking.tempOk,
          tempWarning: t.tracking.tempWarning,
          timeline: t.tracking.timeline,
          emptyFilteredTitle: t.tracking.emptyFilteredTitle,
          emptyFilteredBody: t.tracking.emptyFilteredBody,
          resetFilter: t.tracking.resetFilter,
        }}
      />

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">{t.tracking.note}</p>
    </div>
  );
}
