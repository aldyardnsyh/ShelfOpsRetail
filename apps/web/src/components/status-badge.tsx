"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/client";

type Kind = "session" | "document" | "alert" | "severity" | "alertType";

const variants: Record<Kind, Record<string, BadgeProps["variant"]>> = {
  session: {
    draft: "neutral",
    processing: "accent",
    review: "accent",
    final: "success",
    partial: "warning",
  },
  document: {
    ingested: "success",
    queued: "neutral",
    parsing: "accent",
    chunking: "accent",
    embedding: "accent",
    ready: "success",
    failed: "danger",
  },
  alert: {
    open: "warning",
    acknowledged: "neutral",
    resolved: "success",
  },
  severity: {
    low: "neutral",
    medium: "warning",
    high: "danger",
  },
  alertType: {
    oos: "danger",
    price_mismatch: "warning",
    low_confidence: "neutral",
  },
};

export function StatusBadge({
  kind,
  value,
  className,
}: {
  kind: Kind;
  value: string;
  className?: string;
}) {
  const { t } = useI18n();
  const dictionary = t.status[kind] as Record<string, string>;
  const label = dictionary[value] ?? value;
  const variant = variants[kind][value] ?? "neutral";

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
