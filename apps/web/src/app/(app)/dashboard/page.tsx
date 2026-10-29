import type { Metadata } from "next";
import Link from "next/link";

import { AlertsList } from "@/components/alerts-list";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Camera, ChevronRight } from "@/components/icons";
import { MonitorDashboard } from "@/components/monitor-dashboard";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getAlerts, getInventory, getMonitor } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import {
  toMonitorData,
  toOperationsData,
  type InventoryPayload,
  type MonitorPayload,
} from "@/lib/monitor-adapter";

export const metadata: Metadata = {
  title: "Ringkasan",
};

export default async function DashboardPage() {
  const { t } = await getI18n();
  const [alerts, monitorResult, inventoryResult] = await Promise.all([
    getAlerts({ limit: 5 }),
    getMonitor(),
    getInventory(),
  ]);
  const data = toMonitorData(
    (monitorResult.ok ? monitorResult.data : {}) as MonitorPayload,
  );
  const ops = toOperationsData(
    (inventoryResult.ok ? inventoryResult.data : {}) as InventoryPayload,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.monitor.title}
        description={t.monitor.subtitle}
        meta={<p className="text-xs text-muted-foreground">{t.monitor.period}</p>}
        actions={
          <>
            <Button asChild size="sm">
              <Link href="/shelf/new">
                <Camera />
                {t.nav.startAudit}
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/copilot">{t.nav.copilot}</Link>
            </Button>
          </>
        }
      />

      <MonitorDashboard
        data={data}
        ops={ops}
        labels={{ ...t.monitor, live: t.landing.monitor.live, fps: "fps" }}
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {t.monitor.alertsTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{t.monitor.alertsBody}</p>
          </div>
          <Button asChild variant="tertiary" size="sm" className="shrink-0">
            <Link href="/alerts">
              {t.monitor.viewAll}
              <ChevronRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {!alerts.ok ? (
            <div className="p-5">
              <ErrorState
                error={alerts.error}
                title={t.dashboard.unavailableTitle}
                body={t.dashboard.unavailableBody}
                retry={false}
              />
            </div>
          ) : alerts.data.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={t.dashboard.alertsEmptyTitle}
                body={t.dashboard.alertsEmptyBody}
              />
            </div>
          ) : (
            <AlertsList alerts={alerts.data} columns={2} />
          )}
        </CardContent>
      </Card>

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        {t.monitor.demo}
      </p>
    </div>
  );
}


