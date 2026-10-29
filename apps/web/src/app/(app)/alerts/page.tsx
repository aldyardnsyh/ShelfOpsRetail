import type { Metadata } from "next";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { AlertsTable } from "@/components/alerts-table";
import { getAlerts, getMe } from "@/lib/data";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Peringatan",
};

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ alert?: string }>;
}) {
  const { alert: highlightId } = await searchParams;
  const { t } = await getI18n();
  const [alerts, me] = await Promise.all([getAlerts(), getMe()]);
  const canUpdate = me.ok ? can(me.data.role, "alert.update") : false;

  return (
    <div className="space-y-6">
      <PageHeader title={t.alerts.title} description={t.alerts.subtitle} />
      {!alerts.ok ? (
        <ErrorState error={alerts.error} />
      ) : (
        <AlertsTable
          alerts={alerts.data}
          canUpdate={canUpdate}
          highlightId={highlightId}
        />
      )}
    </div>
  );
}
