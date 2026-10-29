import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AlertsList } from "@/components/alerts-list";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ArrowLeft } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { SessionsTable } from "@/components/sessions-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getAlerts, getAudits, getStores } from "@/lib/data";
import { formatDate, formatNumber, titleCaseChannel } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { KpiStrip } from "@/components/ui/kpi-strip";

export const metadata: Metadata = {
  title: "Detail toko",
};

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { t, locale } = await getI18n();
  const [stores, audits, alerts] = await Promise.all([
    getStores(),
    getAudits({ store_id: id }),
    getAlerts({ store_id: id }),
  ]);

  if (!stores.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.stores.detailTitle} description={t.stores.detailSubtitle} />
        <ErrorState error={stores.error} />
      </div>
    );
  }

  const store = stores.data.find((item) => item.id === id);
  if (!store) {
    notFound();
  }

  const sessions = audits.ok
    ? audits.data
        .slice()
        .sort((a, b) =>
          (b.created_at ?? "").localeCompare(a.created_at ?? ""),
        )
    : [];
  const scored = sessions.filter(
    (session): session is typeof session & { score: number } =>
      typeof session.score === "number",
  );
  const averageScore =
    scored.length > 0
      ? scored.reduce((total, session) => total + session.score, 0) / scored.length
      : null;
  const openAlerts = alerts.ok
    ? alerts.data.filter((alert) => alert.status !== "resolved").length
    : null;
  const lastAudit = sessions[0]?.created_at ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/stores"
          className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft className="size-3.5" />
          {t.stores.backToStores}
        </Link>
      </div>

      <PageHeader
        title={store.name}
        description={t.stores.detailSubtitle}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{store.code}</Badge>
            <Badge variant="outline">{store.region}</Badge>
            <Badge variant="outline">
              {store.channel
                ? (t.channels[store.channel] ?? titleCaseChannel(store.channel))
                : "-"}
            </Badge>
          </div>
        }
      />

      <KpiStrip
        items={[
          {
            label: t.stores.kpiAudits,
            value: audits.ok ? formatNumber(sessions.length, locale) : "-",
          },
          {
            label: t.stores.kpiScore,
            value:
              averageScore === null
                ? "-"
                : `${formatNumber(Math.round(averageScore), locale)}/100`,
            hint:
              averageScore !== null
                ? `${t.stores.ofTotal} ${formatNumber(scored.length, locale)} ${t.sessions.count}`
                : undefined,
          },
          {
            label: t.stores.kpiOpenAlerts,
            value: openAlerts === null ? "-" : formatNumber(openAlerts, locale),
          },
          {
            label: t.stores.lastAudit,
            value: lastAudit ? formatDate(lastAudit, locale) : "-",
          },
        ]}
      />

      <div className="grid items-start gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="border-b border-border">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {t.stores.auditHistoryTitle}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t.stores.auditHistorySubtitle}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {!audits.ok ? (
              <div className="p-5">
                <ErrorState error={audits.error} retry={false} />
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title={t.stores.noAuditsTitle}
                  body={t.stores.noAuditsBody}
                />
              </div>
            ) : (
              <SessionsTable sessions={sessions} showStore={false} showImages={false} />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="border-b border-border">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {t.stores.alertTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{t.stores.alertSubtitle}</p>
          </CardHeader>
          <CardContent className="p-0">
            {!alerts.ok ? (
              <div className="p-5">
                <ErrorState error={alerts.error} retry={false} />
              </div>
            ) : alerts.data.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title={t.stores.noAlertsTitle}
                  body={t.stores.noAlertsBody}
                />
              </div>
            ) : (
              <AlertsList alerts={alerts.data} linkToSessions showStore={false} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
