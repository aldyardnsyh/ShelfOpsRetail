import type { Metadata } from "next";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { ReportsView, type ReportRow, type ScheduleRow, type SeriesPoint } from "@/components/reports-view";
import { formatNumber } from "@/lib/format";
import { getReports } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { KpiStrip } from "@/components/ui/kpi-strip";

// ReportsPayload adalah bentuk /api/v1/reports (summary, reports, series, schedules).
type ReportsPayload = {
  summary: {
    total: number;
    ready: number;
    scheduled: number;
    last_generated: string | null;
    stores_covered: number;
    avg_availability_pct: number | null;
    period_days: number;
  };
  reports: ReportRow[];
  series: SeriesPoint[];
  schedules: ScheduleRow[];
};

export const metadata: Metadata = {
  title: "Laporan",
};

export default async function ReportsPage() {
  const { t, locale } = await getI18n();
  const res = await getReports();
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t.reports.title}
          description={t.reports.subtitle}
          meta={<p className="text-xs text-muted-foreground">{t.reports.meta}</p>}
        />
        <ErrorState error={res.error} />
      </div>
    );
  }
  const data = res.data as unknown as ReportsPayload;
  const s = data.summary;
  const activeSchedules = data.schedules.filter((schedule) => schedule.active).length;
  const baseMetrics =
    (data.reports[0]?.metrics as
      | {
          visitors: number;
          availability_pct: number;
          oos_rate_pct: number;
          price_mismatch: number;
          tasks_open: number;
          stock_value_idr: number;
        }
      | undefined) ??
    {
      visitors: 0,
      availability_pct: 0,
      oos_rate_pct: 0,
      price_mismatch: 0,
      tasks_open: 0,
      stock_value_idr: 0,
    };
  const avgAvailability =
    typeof s.avg_availability_pct === "number" ? s.avg_availability_pct : 0;

  return (
    <div className="min-w-0 space-y-6 overflow-x-clip">
      <PageHeader
        title={t.reports.title}
        description={t.reports.subtitle}
        meta={<p className="text-xs text-muted-foreground">{t.reports.meta}</p>}
      />

      <KpiStrip
        items={[

{
  label: t.reports.kpiReady,
  value: formatNumber(s.ready, locale),
  hint: `${formatNumber(s.total, locale)} ${t.reports.tabReports.toLowerCase()}`,
},
{
  label: t.reports.kpiScheduled,
  value: formatNumber(s.scheduled, locale),
  hint: t.reports.kindDaily,
},
{
  label: t.reports.kpiSchedules,
  value: formatNumber(activeSchedules, locale),
  hint: t.reports.tabSchedules,
},
{
  label: t.reports.kpiCoverage,
  value: formatNumber(s.stores_covered, locale),
  hint: `${avgAvailability.toFixed(1)}% ${t.reports.summaryAvailability.toLowerCase()}`,
},
        ]}
      />

      <ReportsView
        reports={data.reports as unknown as ReportRow[]}
        schedules={data.schedules}
        series={data.series}
        baseMetrics={baseMetrics}
        labels={{
          tabReports: t.reports.tabReports,
          tabSchedules: t.reports.tabSchedules,
          search: t.common.search,
          searchPlaceholder: t.reports.searchPlaceholder,
          allKinds: t.reports.allKinds,
          kindDaily: t.reports.kindDaily,
          kindWeekly: t.reports.kindWeekly,
          kindMonthly: t.reports.kindMonthly,
          period: t.reports.period,
          scope: t.reports.scope,
          stores: t.reports.stores,
          status: t.reports.status,
          generated: t.reports.generated,
          format: t.reports.format,
          actions: t.reports.actions,
          statuses: t.reports.statuses,
          scheduleName: t.reports.scheduleName,
          cadence: t.reports.cadence,
          recipients: t.reports.recipients,
          active: t.reports.active,
          inactive: t.reports.inactive,
          newReport: t.reports.newReport,
          newReportTitle: t.reports.newReportTitle,
          newReportBody: t.reports.newReportBody,
          newReportKind: t.reports.newReportKind,
          newReportScope: t.reports.newReportScope,
          newReportSubmit: t.reports.newReportSubmit,
          newReportSuccess: t.reports.newReportSuccess,
          exportCta: t.reports.exportCta,
          exportNote: t.reports.exportNote,
          summaryTitle: t.reports.summaryTitle,
          summaryVisitors: t.reports.summaryVisitors,
          summaryAvailability: t.reports.summaryAvailability,
          summaryOos: t.reports.summaryOos,
          summaryMismatch: t.reports.summaryMismatch,
          summaryTasks: t.reports.summaryTasks,
          summaryStock: t.reports.summaryStock,
          seriesTitle: t.reports.seriesTitle,
          seriesBody: t.reports.seriesBody,
          seriesAvailability: t.reports.seriesAvailability,
          seriesOos: t.reports.seriesOos,
          viewSummary: t.reports.viewSummary,
          hideSummary: t.reports.hideSummary,
          emptyTitle: t.reports.emptyTitle,
          emptyBody: t.reports.emptyBody,
        }}
      />

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        {t.reports.note}
      </p>
    </div>
  );
}

