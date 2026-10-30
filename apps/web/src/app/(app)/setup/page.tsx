import type { Metadata } from "next";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { SetupWizard } from "@/components/setup-wizard";
import { getServerApi } from "@/lib/api";
import { getMe } from "@/lib/data";
import { DEMO_MODE } from "@/lib/demo";
import { guardCapability } from "@/lib/guard";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Setup produksi",
};

export default async function SetupPage() {
  const denied = await guardCapability("workspace.manage");
  if (denied) return denied;

  const { t } = await getI18n();
  const me = await getMe();
  if (!me.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.setup.title} description={t.setup.subtitle} />
        <ErrorState error={me.error} />
      </div>
    );
  }

  let status: {
    workspace_name: string;
    is_demo: boolean;
    has_admin: boolean;
    setup_done: boolean;
    providers: Record<string, string>;
    provider_ok: boolean;
  } | null = null;

  if (!DEMO_MODE) {
    try {
      const api = await getServerApi();
      const { response, data } = await api.system.setupStatus();
      if (response.ok && data) {
        status = data as unknown as typeof status;
      }
    } catch {
      status = null;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t.setup.title} description={t.setup.subtitle} />
      <SetupWizard
        demoMode={DEMO_MODE}
        initialStatus={status}
        workspaceName={me.ok ? (me.data.workspace?.name ?? "") : ""}
        labels={{
          stepStatus: t.setup.stepStatus,
          stepWorkspace: t.setup.stepWorkspace,
          stepAI: t.setup.stepAI,
          stepAdmin: t.setup.stepAdmin,
          stepDone: t.setup.stepDone,
          statusTitle: t.setup.statusTitle,
          statusBody: t.setup.statusBody,
          workspaceTitle: t.setup.workspaceTitle,
          workspaceBody: t.setup.workspaceBody,
          workspaceName: t.setup.workspaceName,
          aiTitle: t.setup.aiTitle,
          aiBody: t.setup.aiBody,
          llmProvider: t.setup.llmProvider,
          llmBaseUrl: t.setup.llmBaseUrl,
          llmApiKey: t.setup.llmApiKey,
          llmModel: t.setup.llmModel,
          adminTitle: t.setup.adminTitle,
          adminBody: t.setup.adminBody,
          adminEmail: t.setup.adminEmail,
          adminPassword: t.setup.adminPassword,
          adminName: t.setup.adminName,
          doneTitle: t.setup.doneTitle,
          doneBody: t.setup.doneBody,
          submit: t.setup.submit,
          saving: t.setup.saving,
          back: t.setup.back,
          next: t.setup.next,
          hasAdmin: t.setup.hasAdmin,
          noAdmin: t.setup.noAdmin,
          setupDone: t.setup.setupDone,
          setupPending: t.setup.setupPending,
          providerOk: t.setup.providerOk,
          providerMock: t.setup.providerMock,
          demoNote: t.setup.demoNote,
        }}
      />
    </div>
  );
}
