"use client";

import { Warning } from "@/components/icons";
import { CopyTrace } from "@/components/copy-trace";
import { RetryButton } from "@/components/retry-button";
import { useI18n } from "@/lib/i18n/client";
import type { UiProblem } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ErrorState({
  error,
  title,
  body,
  className,
  retry = true,
}: {
  error?: UiProblem;
  title?: string;
  body?: string;
  className?: string;
  retry?: boolean;
}) {
  const { t } = useI18n();
  const heading = title ?? t.states.errorTitle;
  const description =
    body ??
    (error?.status === 0 ? t.states.offlineBody : t.states.errorBody);

  return (
    <div
      className={cn(
        "rounded-lg border border-danger-soft-border bg-danger-soft/60 p-4",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Warning className="mt-0.5 size-4 shrink-0 text-danger-strong" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <p className="text-sm font-medium text-danger-strong">{heading}</p>
            <p className="text-sm text-foreground/80">{description}</p>
            {error?.detail ? (
              <p className="text-xs text-muted-foreground">{error.detail}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {retry ? <RetryButton /> : null}
            {error?.traceId ? <CopyTrace traceId={error.traceId} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
