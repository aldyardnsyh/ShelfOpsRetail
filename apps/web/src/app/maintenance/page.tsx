"use client";

import Link from "next/link";

import { Refresh, Warning } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

export default function MaintenancePage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-5 px-4 py-10">
      <Logo />
      <span className="flex size-10 items-center justify-center rounded-lg border border-warning-soft-border bg-warning-soft text-warning-strong">
        <Warning className="size-5" />
      </span>
      <div className="space-y-2">
        <p className="font-mono text-xs text-muted-foreground">503</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t.states.maintenanceTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{t.states.maintenanceBody}</p>
        <p className="text-xs font-medium text-foreground">{t.states.maintenanceWindow}</p>
        <p className="text-xs text-muted-foreground">{t.states.maintenanceNote}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => window.location.reload()}>
          <Refresh />
          {t.states.maintenanceRetry}
        </Button>
        <Button asChild variant="secondary">
          <Link href="/docs">{t.states.docsLink}</Link>
        </Button>
      </div>
    </div>
  );
}
