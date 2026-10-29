import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { ErrorState } from "@/components/error-state";
import { AppShell } from "@/components/app-shell";
import { getMe } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import type { AppRole } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [me, { t }] = await Promise.all([getMe(), getI18n()]);

  if (!me.ok) {
    if (me.error.status === 401) {
      const pathname = (await headers()).get("x-pathname") ?? "/dashboard";
      redirect("/login?expired=1&next=" + encodeURIComponent(pathname));
    }
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-5 px-4 py-10">
        <Logo />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t.states.errorTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{t.states.errorBody}</p>
        </div>
        <ErrorState error={me.error} />
      </div>
    );
  }

  return (
    <AppShell me={me.data} role={me.data.role as AppRole}>
      {children}
    </AppShell>
  );
}
