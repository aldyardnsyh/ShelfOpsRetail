import type { Metadata } from "next";

import { ExportCsvButton } from "@/components/lab-export-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

// RunRow datang dari /api/v1/evals/overview.runs.
type RunRow = {
  id: string;
  label: string;
  model: string;
  retrieval: string;
  dataset_id: string;
  created_at: string;
  metrics: Record<string, number>;
};

type EvalsPayload = {
  runs: RunRow[];
  metric_labels: Record<string, string>;
};

const METRIC_ORDER = [
  "faithfulness",
  "answer_relevance",
  "context_precision",
  "context_recall",
  "refusal_accuracy",
  "p95_latency_ms",
] as const;

type MetricKey = (typeof METRIC_ORDER)[number];

function formatMetric(key: MetricKey, value: number, locale: "id" | "en") {
  if (key === "p95_latency_ms") {
    return `${formatNumber(value, locale)} ms`;
  }
  return `${(value * 100).toFixed(0)}%`;
}

export const metadata: Metadata = {
  title: "Run & Compare",
};

export default async function EvalComparePage() {
  const denied = await guardCapability("lab.run");
  if (denied) return denied;

  const { t, locale } = await getI18n();
  const res = await getEvalsOverview();
  const payload = res.ok ? (res.data as unknown as EvalsPayload) : null;
  const [runA, runB] = payload?.runs?.slice(0, 2) ?? [];

  if (!runA || !runB) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.evalCompare.title} description={t.evalCompare.subtitle} />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t.evalCompare.emptyBody}
          </CardContent>
        </Card>
      </div>
    );
  }

  const results = METRIC_ORDER.map((key) => {
    const a = runA.metrics[key] ?? 0;
    const b = runB.metrics[key] ?? 0;
    const delta = b - a;
    const lowerIsBetter = key === "p95_latency_ms";
    const winner =
      Math.abs(delta) < 0.005
        ? "tie"
        : (lowerIsBetter ? delta < 0 : delta > 0)
          ? "B"
          : "A";
    return { key, a, b, delta, lowerIsBetter, winner };
  });
  const aWins = results.filter((item) => item.winner === "A").length;
  const bWins = results.filter((item) => item.winner === "B").length;
  const latencyDelta =
    (runB.metrics.p95_latency_ms ?? 0) - (runA.metrics.p95_latency_ms ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.evalCompare.title}
        description={t.evalCompare.subtitle}
        actions={
          <ExportCsvButton
            filename="ShelfOpsRetail-eval-compare.csv"
            label={t.evalCompare.exportCta}
            rows={[
              [t.evalCompare.metricName, "Run A", "Run B", t.evalCompare.delta],
              ...METRIC_ORDER.map((key) => {
                const a = runA.metrics[key] ?? 0;
                const b = runB.metrics[key] ?? 0;
                return [key, a, b, Number((b - a).toFixed(3))];
              }),
            ]}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {[runA, runB].map((run, index) => (
          <Card key={run.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm">
                  {index === 0 ? t.evalCompare.runA : t.evalCompare.runB}
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[11px]">
                  {run.id}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium text-foreground">{run.label}</p>
              <p className="text-muted-foreground">
                {t.evalCompare.model}: {run.model}
              </p>
              <p className="text-muted-foreground">
                {t.evalCompare.retrieval}: {run.retrieval}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(run.created_at, locale)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-subtle px-4 py-3 text-sm">
        <span className="font-medium text-foreground">
          {t.evalCompare.verdict
            .replace("{b}", String(bWins))
            .replace("{a}", String(aWins))
            .replace("{total}", String(METRIC_ORDER.length))}
        </span>
        <span className="text-muted-foreground">
          {t.evalCompare.verdictLatency.replace(
            "{delta}",
            `${Math.abs(latencyDelta)} ms`,
          )}
        </span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t.evalCompare.metrics}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.evalCompare.metricName}</TableHead>
                <TableHead className="text-right">Run A</TableHead>
                <TableHead className="text-right">Run B</TableHead>
                <TableHead className="text-right">{t.evalCompare.delta}</TableHead>
                <TableHead>{t.evalCompare.winner}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map(({ key, a, b, delta, winner }) => {
                const label =
                  payload?.metric_labels?.[
                    key as keyof NonNullable<typeof payload>["metric_labels"]
                  ] ?? key;
                return (
                  <TableRow key={key}>
                    <TableCell className="font-medium text-foreground">
                      {label}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatMetric(key, a, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatMetric(key, b, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={
                          winner === "tie"
                            ? "text-muted-foreground"
                            : winner === "B"
                              ? "text-success-strong"
                              : "text-warning-strong"
                        }
                      >
                        {key === "p95_latency_ms"
                          ? `${delta > 0 ? "+" : ""}${formatNumber(Math.round(delta), locale)} ms`
                          : `${delta > 0 ? "+" : ""}${formatNumber(Number((delta * 100).toFixed(1)), locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pp`}
                      </span>
                    </TableCell>
                      <TableCell>
                        {winner === "tie" ? (
                          <span className="text-xs text-muted-foreground">
                            {t.evalCompare.tie}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                            <span aria-hidden="true">{winner === "B" ? "▲" : "▼"}</span>
                            {winner === "B" ? t.evalCompare.runB : t.evalCompare.runA}
                          </span>
                        )}
                      </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
