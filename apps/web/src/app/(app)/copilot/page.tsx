import type { Metadata } from "next";
import Link from "next/link";

import { CopilotWorkspace } from "@/components/copilot-workspace";
import { ErrorState } from "@/components/error-state";
import { ArrowLeft } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getConversation, getConversations } from "@/lib/data";
import { DEMO_MODE } from "@/lib/demo";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Copilot",
};

export default async function CopilotPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { t } = await getI18n();
  const params = await searchParams;
  const conversationId =
    typeof params.c === "string" && params.c.length > 0 ? params.c : null;

  const conversations = await getConversations();
  if (!conversations.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.copilot.title} description={t.copilot.subtitle} />
        <ErrorState
          error={conversations.error}
          title={t.copilot.unavailableTitle}
          body={t.copilot.unavailableBody}
        />
      </div>
    );
  }

  const initial = conversationId ? await getConversation(conversationId) : null;

  if (initial && !initial.ok) {
    return (
      <div className="space-y-6">
        <Button asChild variant="tertiary" size="sm" className="self-start">
          <Link href="/copilot">
            <ArrowLeft />
            {t.copilot.history}
          </Link>
        </Button>
        <PageHeader title={t.copilot.title} description={t.copilot.subtitle} />
        <ErrorState error={initial.error} />
        <div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/copilot">{t.copilot.newConversation}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t.copilot.title} description={t.copilot.subtitle} />
      <CopilotWorkspace
        key={conversationId ?? "new"}
        conversations={conversations.data}
        initialConversation={initial && initial.ok ? initial.data : null}
        demoMode={DEMO_MODE}
      />
    </div>
  );
}
