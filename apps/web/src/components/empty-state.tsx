import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

function EmptyShelfGlyph() {
  return (
    <svg
      viewBox="0 0 72 48"
      className="size-16 text-border"
      fill="none"
      aria-hidden="true"
    >
      <rect x="4" y="7" width="64" height="4" rx="1.5" fill="currentColor" />
      <rect x="4" y="22" width="64" height="4" rx="1.5" fill="currentColor" />
      <rect x="4" y="37" width="64" height="4" rx="1.5" fill="currentColor" />
      <rect x="18" y="14" width="18" height="5" rx="1" stroke="currentColor" strokeDasharray="3 3" />
      <rect x="44" y="29" width="16" height="5" rx="1" stroke="currentColor" strokeDasharray="3 3" />
    </svg>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-dashed border-border bg-surface-subtle px-5 py-8 sm:items-center sm:text-center",
        className,
      )}
    >
      <EmptyShelfGlyph />
      <div className="max-w-md space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
