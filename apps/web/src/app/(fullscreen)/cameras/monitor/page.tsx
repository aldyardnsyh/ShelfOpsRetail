import type { Metadata } from "next";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { getMonitor } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { MonitorWall, type MonitorWallData } from "@/components/monitor-wall";

export const metadata: Metadata = {
  title: "Pantauan penuh",
};

type MonitorWallHour = { hour: string; visitors: number };
type MonitorWallVisitors = {
  id: string;
  entered_at: string;
  dwell_seconds: number;
  zone: string;
  status: "in_store" | "checked_out";
};

export default async function MonitorPage() {
  const { t } = await getI18n();
  const res = await getMonitor();
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t.monitorWall?.title ?? "Monitor"}
          description={t.monitorWall?.subtitle ?? ""}
        />
        <ErrorState error={res.error} />
      </div>
    );
  }
  const raw = res.data as unknown as MonitorWallData;
  // Sesuaikan bentuk ke kontrak MonitorWall (hour string, tanpa hourly_dwell).
  const data = {
    ...raw,
    hourly: (raw.hourly as unknown as MonitorWallHour[]).map((point) => ({
      hour: `${point.hour}`,
      visitors: point.visitors,
    })),
    visitors: (raw.visitors as unknown as MonitorWallVisitors[]),
  } as MonitorWallData;

  return <MonitorWall data={data} labels={t.monitorWall} />;
}
