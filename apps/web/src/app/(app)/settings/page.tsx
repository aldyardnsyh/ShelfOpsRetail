import type { Metadata } from "next";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { getMe, getWorkspace } from "@/lib/data";
import { guardCapability } from "@/lib/guard";
import { DEMO_MODE } from "@/lib/demo";
import { getI18n } from "@/lib/i18n/server";
import { isAdminRole } from "@/lib/types";

export const metadata: Metadata = {
  title: "Pengaturan",
};

export default async function SettingsPage() {
  // Halaman settings berisi info workspace; hanya admin/owner yang boleh melihat ringkasannya.
  const denied = await guardCapability("workspace.manage");
  if (denied) return denied;

  const { t } = await getI18n();
  const [me, workspace] = await Promise.all([getMe(), getWorkspace()]);

  if (!me.ok || !workspace.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.settings.title} description={t.settings.subtitle} />
        <ErrorState
          error={!me.ok ? me.error : !workspace.ok ? workspace.error : undefined}
          title={t.settings.unavailableTitle}
          body={t.settings.unavailableBody}
        />
      </div>
    );
  }

  const canManage = isAdminRole(me.data.role);

  return (
    <div className="space-y-6">
      <PageHeader title={t.settings.title} description={t.settings.subtitle} />
      <SettingsForm me={me.data} workspace={workspace.data} demoMode={DEMO_MODE} />
    </div>
  );
}
