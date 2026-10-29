import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { VisitorsView } from "@/components/visitors-view";
import { LiveVisitorLog } from "@/components/live-visitor-log";
import { getI18n } from "@/lib/i18n/server";
import { getMonitor } from "@/lib/data";

// MonitorVisitorRow adalah bentuk /api/v1/monitor.visitors.
type MonitorVisitorRow = {
  id: string;
  entered_at: string;
  dwell_seconds: number;
  zone: string;
  status: "in_store" | "checked_out";
};

export const metadata: Metadata = {
  title: "Pengunjung",
};

export default async function VisitorsPage() {
  const { t } = await getI18n();
  const res = await getMonitor();
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t.nav.visitors}
          description={t.monitor.visitorsBody}
        />
        <ErrorState error={res.error} />
      </div>
    );
  }
  const raw = (res.data as unknown as { visitors: MonitorVisitorRow[] }).visitors;
  const visitors = [...raw]
    .sort((a, b) => b.entered_at.localeCompare(a.entered_at))
    .map((visitor, index) => ({
      ...visitor,
      // Nomor urut stabil per pemuatan; UUID asli tidak berguna untuk
      // menyebut pengunjung saat operasi toko.
      id: `P-${String(index + 1).padStart(3, "0")}`,
    }));

  const labels = {
    visitorId: t.monitor.visitorId,
    entered: t.monitor.entered,
    zone: t.monitor.zone,
    dwell: t.monitor.dwell,
    status: t.monitor.status,
    inStore: t.monitor.inStore,
    checkedOut: t.monitor.checkedOut,
    close: t.common.close,
    detail: t.common.detail,
    prev: t.common.previous,
    next: t.common.next,
    zoneLogTitle: t.monitor.zoneLogTitle,
    zoneLogEmpty: t.monitor.zoneLogEmpty,
    totalDwell: t.monitor.totalDwell,
    lastZone: t.monitor.lastZone,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.nav.visitors}
        description={t.monitor.visitorsBody}
      />

      {visitors.length === 0 ? (
        <EmptyState title={t.common.noResults} body={t.monitor.visitorsEmpty} />
      ) : (
        <VisitorsView visitors={visitors} labels={labels} />
      )}

      <LiveVisitorLog
        labels={{
          title: t.monitor.liveLogTitle,
          subtitle: t.monitor.liveLogSubtitle,
          empty: t.monitor.liveLogEmpty,
        }}
      />
    </div>
  );
}
