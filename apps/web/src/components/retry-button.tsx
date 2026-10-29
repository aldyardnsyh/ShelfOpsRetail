"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Refresh } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

export function RetryButton({ label }: { label?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
    >
      <Refresh className={isPending ? "animate-spin motion-reduce:animate-none" : ""} />
      {isPending ? `${t.common.loading}...` : (label ?? t.common.retry)}
    </Button>
  );
}
