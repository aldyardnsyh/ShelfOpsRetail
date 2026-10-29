import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { DemoBanner } from "@/components/demo-banner";
import type { MeResponse } from "@shelfops/api-client";
import { DEMO_MODE } from "@/lib/demo";
import { getI18n } from "@/lib/i18n/server";
import type { AppRole } from "@/lib/types";

export async function AppShell({
  me,
  role,
  children,
}: {
  me: MeResponse;
  role: AppRole;
  children: ReactNode;
}) {
  const { t } = await getI18n();
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background"
      >
        {t.common.skipToContent}
      </a>
      <AppSidebar role={role} workspaceName={me.workspace.name} />
      <div className="lg:pl-60">
        <AppHeader
          name={me.user.name}
          email={me.user.email}
          role={role}
          workspaceName={me.workspace.name}
        />
        <main
          id="main"
          className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8"
        >
          {DEMO_MODE ? <DemoBanner className="mb-5" /> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
