import type { Metadata } from "next";
import Link from "next/link";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CamerasGrid } from "@/components/cameras-grid";
import { getI18n } from "@/lib/i18n/server";
import { getMonitor } from "@/lib/data";

// MonitorCamera adalah bentuk /api/v1/monitor.cameras.
type MonitorCamera = {
  id: string;
  name: string;
  zone: string;
  status: "online" | "offline";
  fps: number;
};

export const metadata: Metadata = {
  title: "Kamera",
};

export default async function CamerasPage() {
  const { t } = await getI18n();
  const res = await getMonitor();
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t.nav.cameras}
          description={t.monitor.camerasBody}
          meta={<p className="text-xs text-muted-foreground">{t.monitor.period}</p>}
        />
        <ErrorState error={res.error} />
      </div>
    );
  }
  const cameras = (res.data as unknown as { cameras: MonitorCamera[] }).cameras;

  const labels = {
    online: t.monitor.online,
    offline: t.monitor.offline,
    live: t.landing.monitor.live,
    close: t.common.close,
    prev: t.common.previous,
    next: t.common.next,
    fps: "fps",
    zone: t.monitor.zone,
    preview: t.monitor.preview,
  };

  const online = cameras.filter((camera) => camera.status === "online").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.nav.cameras}
        description={t.monitor.camerasBody}
        meta={
          <p className="text-xs text-muted-foreground">
            <span className="tabular">{online}/{cameras.length}</span> {t.monitor.camerasActive}
            <span className="mx-1.5 text-border-strong">|</span>
            {t.monitor.period}
          </p>
        }
        actions={
          <Button asChild size="sm" variant="secondary">
            <Link href="/cameras/monitor">{t.nav.monitorWall}</Link>
          </Button>
        }
      />

      <CamerasGrid cameras={cameras} labels={labels} />

      <p className="text-xs text-muted-foreground">{t.monitor.demo}</p>
    </div>
  );
}
