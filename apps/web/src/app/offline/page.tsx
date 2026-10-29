"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Refresh, Warning } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

export default function OfflinePage() {
  const { t, locale } = useI18n();
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    setLastChecked(
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date()),
    );
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [locale]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-5 px-4 py-10">
      <Logo />
      <span className="flex size-10 items-center justify-center rounded-lg border border-warning-soft-border bg-warning-soft text-warning-strong">
        <Warning className="size-5" />
      </span>
      <div className="space-y-2">
        <p className="font-mono text-xs text-muted-foreground">Offline</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t.states.offlineTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{t.states.offlineBody}</p>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div className="flex gap-1.5">
            <dt>{t.states.networkStatus}:</dt>
            <dd className="font-medium text-foreground">
              {online === null ? "-" : online ? t.monitor.online : t.monitor.offline}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>{t.states.offlineLastChecked}:</dt>
            <dd className="tabular font-medium text-foreground">{lastChecked ?? "-"}</dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => window.location.reload()}>
          <Refresh />
          {t.states.offlineRetry}
        </Button>
        <Button asChild variant="secondary">
          <Link href="/dashboard">{t.states.backDashboard}</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t.monitor.demo}</p>
    </div>
  );
}

