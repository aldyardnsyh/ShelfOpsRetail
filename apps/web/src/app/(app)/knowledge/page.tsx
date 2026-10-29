import type { Metadata } from "next";

import { DocumentUpload } from "@/components/document-upload";
import { DocumentsTable } from "@/components/documents-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { RetryButton } from "@/components/retry-button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getDocuments } from "@/lib/data";
import { DEMO_MODE } from "@/lib/demo";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Knowledge Base",
};

export default async function KnowledgePage() {
  const { t, locale } = await getI18n();
  const documents = await getDocuments();

  return (
    <div className="space-y-6">
      <PageHeader title={t.knowledge.title} description={t.knowledge.subtitle} />

      <Card>
        <CardHeader className="border-b border-border">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {t.knowledge.uploadTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{t.knowledge.uploadBody}</p>
        </CardHeader>
        <CardContent className="pt-5">
          <DocumentUpload demoMode={DEMO_MODE} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {t.knowledge.tableTitle}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t.knowledge.tableSubtitle}
            </p>
          </div>
          <RetryButton label={t.knowledge.refresh} />
        </CardHeader>
        <CardContent className="p-0">
          {!documents.ok ? (
            <div className="p-5">
              <ErrorState
                error={documents.error}
                title={t.knowledge.unavailableTitle}
                body={t.knowledge.unavailableBody}
                retry={false}
              />
            </div>
          ) : documents.data.items.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={t.knowledge.emptyTitle}
                body={t.knowledge.emptyBody}
              />
            </div>
          ) : (
            <DocumentsTable
              documents={documents.data.items}
              locale={locale}
              t={t}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
