"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Warning } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

export default function AppError({
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
    <div className="flex min-h-[50vh] flex-col items-start justify-center gap-4">
      <span className="flex size-10 items-center justify-center rounded-lg border border-danger-soft-border bg-danger-soft text-danger-strong">
        <Warning className="size-5" />
      </span>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t.states.errorBoundaryTitle}
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          {t.states.errorBoundaryBody}
        </p>
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
      </div>
    </div>
  );
}
