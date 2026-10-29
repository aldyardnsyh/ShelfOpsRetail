import type { Metadata } from "next";

import { AuditTable } from "@/components/audit-table";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { getAuditLogs, getMe } from "@/lib/data";
import { guardCapability } from "@/lib/guard";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Log audit",
};

export default async function AuditPage() {
  const denied = await guardCapability("audit.view");
  if (denied) return denied;

  const { t } = await getI18n();
  const logs = await getAuditLogs();

  return (
    <div className="space-y-6">
      <PageHeader title={t.audit.title} description={t.audit.subtitle} />
      {!logs.ok ? (
        <ErrorState
          error={logs.error}
          title={t.audit.unavailableTitle}
          body={t.audit.unavailableBody}
        />
      ) : (
        <AuditTable logs={logs.data} />
      )}
    </div>
  );
}
