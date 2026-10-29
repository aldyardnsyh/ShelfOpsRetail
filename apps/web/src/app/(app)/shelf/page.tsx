import type { Metadata } from "next";
import Link from "next/link";

import { ErrorState } from "@/components/error-state";
import { Camera } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { SessionsExplorer } from "@/components/sessions-explorer";
import { Button } from "@/components/ui/button";
import { getAudits } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Rak & barang",
};

export default async function ShelfPage() {
  const { t } = await getI18n();
  const audits = await getAudits();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.sessions.shelfTitle}
        description={t.sessions.shelfSubtitle}
        actions={
          <Button asChild size="sm">
            <Link href="/shelf/new">
              <Camera />
              {t.startAudit.cta}
            </Link>
          </Button>
        }
      />
      {!audits.ok ? (
        <ErrorState
          error={audits.error}
          title={t.sessions.unavailableTitle}
          body={t.sessions.unavailableBody}
        />
      ) : (
        <SessionsExplorer sessions={audits.data} />
      )}
    </div>
  );
}
