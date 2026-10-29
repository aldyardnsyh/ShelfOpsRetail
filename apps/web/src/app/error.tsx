"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Warning } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-5 px-4 py-10">
      <Logo />
      <span className="flex size-10 items-center justify-center rounded-lg border border-danger-soft-border bg-danger-soft text-danger-strong">
        <Warning className="size-5" />
      </span>
      <div className="space-y-1.5">
        <p className="font-mono text-xs text-muted-foreground">500</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t.states.errorBoundaryTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{t.states.errorBoundaryBody}</p>
        {error.digest ? (
          <p className="font-mono text-xs text-muted-foreground">
            {t.common.traceId}: {error.digest}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => reset()}>
          {t.states.reload}
        </Button>
        <Button asChild variant="secondary">
          <Link href="/dashboard">{t.states.backDashboard}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">{t.auth.backHome}</Link>
        </Button>
      </div>
    </div>
  );
}
