"use client";

import { Copy } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";

export function CopyTrace({ traceId }: { traceId: string }) {
  const { t } = useI18n();
  const { toast } = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(traceId);
      toast({ title: t.common.copied, description: traceId, variant: "success" });
    } catch {
      toast({ title: traceId, variant: "info" });
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`${t.common.copy} ${t.common.traceId}: ${traceId}`}
      className="inline-flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Copy className="size-3" />
      {traceId}
    </button>
  );
}
