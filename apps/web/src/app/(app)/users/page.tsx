import type { Metadata } from "next";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { UsersTable } from "@/components/users-table";
import { getMe, getMembers } from "@/lib/data";
import { DEMO_MODE } from "@/lib/demo";
import { getI18n } from "@/lib/i18n/server";
import { guardCapability } from "@/lib/guard";

export const metadata: Metadata = {
  title: "Pengguna",
};

export default async function UsersPage() {
  const { t } = await getI18n();
  const [me, members] = await Promise.all([getMe(), getMembers()]);
  const denied = await guardCapability("member.manage");
  if (denied) return denied;


  if (!me.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.users.title} description={t.users.subtitle} />
        <ErrorState error={me.error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t.users.title} description={t.users.subtitle} />
      {!members.ok ? (
        <ErrorState
          error={members.error}
          title={t.users.unavailableTitle}
          body={t.users.unavailableBody}
        />
      ) : (
        <UsersTable members={members.data} demoMode={DEMO_MODE} />
      )}
    </div>
  );
}
