"use client";

import { Info } from "@/components/icons";
import { useI18n } from "@/lib/i18n/client";

export function DemoBanner({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warning-soft-border bg-warning-soft px-3 py-2 text-xs text-warning-strong ${className ?? ""}`}
      role="status"
    >
      <Info className="size-3.5 shrink-0" />
      <span className="font-medium">{t.common.demoBannerTitle}</span>
      <span className="text-warning-strong">{t.common.demoBannerBody}</span>
    </div>
  );
}
