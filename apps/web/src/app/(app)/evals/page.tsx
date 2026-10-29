import type { Metadata } from "next";

import { ExportCsvButton } from "@/components/lab-export-button";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { KpiStrip } from "@/components/ui/kpi-strip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getI18n } from "@/lib/i18n/server";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getEvalsOverview } from "@/lib/data";
import { guardCapability } from "@/lib/guard";

// EvalDatasetRow adalah bentuk /api/v1/evals/overview.datasets.
type EvalDatasetRow = {
  id: string;
  name: string;
  region: string;
  cases: number;
  version: string;
  status: string;
  updated_at: string;
  description: string;
};

type EvalsPayload = { datasets: EvalDatasetRow[] };

export const metadata: Metadata = {
  title: "Eval dataset",
};

const STATUS_VARIANT = {
  active: "success",
  draft: "warning",
  archived: "outline",
} as const;

export default async function EvalsPage() {
  const denied = await guardCapability("lab.run");
  if (denied) return denied;

  const { t, locale } = await getI18n();
  const res = await getEvalsOverview();
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.evals.title} description={t.evals.subtitle} />
        <ErrorState error={res.error} />
      </div>
    );
  }
  const datasets = (
    res.data as EvalsPayload
  ).datasets.map((dataset) => ({
    ...dataset,
    region: dataset.region || "—",
  }));
  const totalCases = datasets.reduce((total, dataset) => total + dataset.cases, 0);
  const activeCount = datasets.filter((dataset) => dataset.status === "active").length;
  const regionCount = new Set(datasets.map((dataset) => dataset.region)).size;
  const lastUpdated = datasets
    .map((dataset) => dataset.updated_at)
    .sort()
    .at(-1);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.evals.title}
        description={t.evals.subtitle}
        actions={
          <ExportCsvButton
            filename="ShelfOpsRetail-eval-datasets.csv"
            label={t.evals.exportCta}
            rows={[
              [
                t.evals.dataset,
                t.evals.region,
                t.evals.cases,
                t.evals.version,
                t.evals.status,
                t.evals.updated,
              ],
              ...datasets.map((dataset) => [
                dataset.name,
                dataset.region,
                dataset.cases,
                dataset.version,
                t.evals.statuses[dataset.status as keyof typeof t.evals.statuses],
                dataset.updated_at,
              ]),
            ]}
          />
        }
      />

      <KpiStrip
        items={[

{ label: t.evals.totalCases, value: formatNumber(totalCases, locale) },
{ label: t.evals.activeDatasets, value: formatNumber(activeCount, locale) },
{ label: t.evals.regions, value: formatNumber(regionCount, locale) },
{
  label: t.evals.lastUpdated,
  value: lastUpdated
    ? formatDateTime(lastUpdated, locale)
    : "-",
},
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.evals.dataset}</TableHead>
                <TableHead>{t.evals.region}</TableHead>
                <TableHead className="text-right">{t.evals.cases}</TableHead>
                <TableHead>{t.evals.version}</TableHead>
                <TableHead>{t.evals.status}</TableHead>
                <TableHead>{t.evals.updated}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.map((dataset) => (
                <TableRow key={dataset.id}>
                  <TableCell>
                    <p className="font-medium text-foreground">{dataset.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {dataset.description}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {dataset.region}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {dataset.cases}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {dataset.version}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        STATUS_VARIANT[
                          dataset.status as keyof typeof STATUS_VARIANT
                        ] ?? "outline"
                      }
                    >
                      {
                        t.evals.statuses[
                          dataset.status as keyof typeof t.evals.statuses
                        ]
                      }
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(dataset.updated_at, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
