"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LocaleToggle({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const [isPending, startTransition] = useTransition();

  async function change(next: Locale) {
    if (next === locale || isPending) return;
    setPendingLocale(next);
    try {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (!response.ok) throw new Error("locale");
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setPendingLocale(null);
    }
  }

  const active = pendingLocale ?? locale;

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border border-border bg-surface-subtle p-0.5",
        className,
      )}
      role="group"
      aria-label={t.common.locale}
    >
      {(["id", "en"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => void change(value)}
          disabled={isPending}
          aria-pressed={active === value}
          className={cn(
            "h-7 rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60",
            active === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === "id" ? "ID" : "EN"}
        </button>
      ))}
    </div>
  );
}
