import type { Metadata } from "next";

import {
  IntegrationsView,
  type ApiKey,
  type Connector,
  type SyncRun,
  type WebhookEvent,
} from "@/components/integrations-view";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { formatClock, formatDate, formatNumber } from "@/lib/format";
import { getIntegrations } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { guardCapability } from "@/lib/guard";
import { KpiStrip } from "@/components/ui/kpi-strip";

// IntegrationsPayload adalah bentuk /api/v1/integrations.
type IntegrationsPayload = {
  summary: {
    active: number;
    total: number;
    last_sync: string | null;
    events_24h: number;
    failures_24h: number;
    pending: number;
  };
  connectors: Connector[];
  sync_runs: SyncRun[];
  api_keys: ApiKey[];
  webhook_events: WebhookEvent[];
};

export const metadata: Metadata = {
  title: "Integrasi",
};

export default async function IntegrationsPage() {
  const denied = await guardCapability("integration.manage");
  if (denied) return denied;

  const { t, locale } = await getI18n();
  const res = await getIntegrations();
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t.integrations.title}
          description={t.integrations.subtitle}
          meta={<p className="text-xs text-muted-foreground">{t.integrations.meta}</p>}
        />
        <ErrorState error={res.error} />
      </div>
    );
  }
  const data = res.data as unknown as IntegrationsPayload;
  const s = data.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.integrations.title}
        description={t.integrations.subtitle}
        meta={<p className="text-xs text-muted-foreground">{t.integrations.meta}</p>}
      />

      <KpiStrip
        items={[

{
  label: t.integrations.kpiActive,
  value: `${formatNumber(s.active, locale)}/${formatNumber(s.total, locale)}`,
  hint: `${formatNumber(s.pending, locale)} ${t.integrations.statuses.not_connected.toLowerCase()}`,
},
{
  label: t.integrations.kpiEvents,
  value: formatNumber(s.events_24h, locale),
  hint: t.integrations.webhookTitle,
},
{
  label: t.integrations.kpiFailures,
  value: formatNumber(s.failures_24h, locale),
  hint: t.integrations.runStatuses.failed,
  tone: s.failures_24h > 0 ? "danger" : "normal",
},
{
  label: t.integrations.kpiLastSync,
  value: s.last_sync ? formatClock(s.last_sync, locale) : "-",
  hint: s.last_sync ? formatDate(s.last_sync, locale) : "-",
},
        ]}
      />

      <IntegrationsView
        connectors={data.connectors as unknown as Connector[]}
        runs={data.sync_runs as unknown as SyncRun[]}
        apiKeys={data.api_keys as unknown as ApiKey[]}
        webhookEvents={data.webhook_events as unknown as WebhookEvent[]}
        labels={{
          tabConnectors: t.integrations.tabConnectors,
          tabRuns: t.integrations.tabRuns,
          tabApi: t.integrations.tabApi,
          connector: t.integrations.connector,
          kind: t.integrations.kind,
          scope: t.integrations.scope,
          status: t.integrations.status,
          lastSync: t.integrations.lastSync,
          records: t.integrations.records,
          latency: t.integrations.latency,
          test: t.integrations.test,
          testing: t.integrations.testing,
          testSuccess: t.integrations.testSuccess,
          statuses: t.integrations.statuses,
          runId: t.integrations.runId,
          runConnector: t.integrations.runConnector,
          started: t.integrations.started,
          duration: t.integrations.duration,
          runStatus: t.integrations.runStatus,
          runRecords: t.integrations.runRecords,
          message: t.integrations.message,
          runStatuses: t.integrations.runStatuses,
          apiTitle: t.integrations.apiTitle,
          apiBody: t.integrations.apiBody,
          keyName: t.integrations.keyName,
          keyScope: t.integrations.keyScope,
          keyCreated: t.integrations.keyCreated,
          keyLastUsed: t.integrations.keyLastUsed,
          keyStatus: t.integrations.keyStatus,
          copyKey: t.integrations.copyKey,
          keyCopied: t.integrations.keyCopied,
          keyCopyFailed: t.integrations.keyCopyFailed,
          keyStatuses: t.integrations.keyStatuses,
          webhookTitle: t.integrations.webhookTitle,
          webhookBody: t.integrations.webhookBody,
          event: t.integrations.event,
          endpoint: t.integrations.endpoint,
          attempts: t.integrations.attempts,
          deliveredAt: t.integrations.deliveredAt,
          eventStatuses: t.integrations.eventStatuses,
          emptyTitle: t.integrations.emptyTitle,
          emptyBody: t.integrations.emptyBody,
          addConnector: t.integrations.addConnector,
          addTitle: t.integrations.addTitle,
          addBody: t.integrations.addBody,
          addKind: t.integrations.addKind,
          addName: t.integrations.addName,
          addSubmit: t.integrations.addSubmit,
          addSuccess: t.integrations.addSuccess,
        }}
      />

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        {t.integrations.note}
      </p>
    </div>
  );
}
