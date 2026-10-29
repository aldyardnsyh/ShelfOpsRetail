import type { Metadata } from "next";

import { Info } from "@/components/icons";
import { ExportCsvButton } from "@/components/lab-export-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { getBenchmarks } from "@/lib/data";
import { cn } from "@/lib/utils";
import { guardCapability } from "@/lib/guard";

// BenchmarkRow datang dari /api/v1/benchmarks.rows.
type BenchmarkRow = {
  id: string;
  platform: string;
  runtime: string;
  latency_ms_p50: number;
  throughput_ips: number;
  memory_mb: number;
  map50: number;
  note?: string;
};

type BenchmarkPayload = {
  meta: { testbed: string; tested_at: string; image_set: string; note_key: string };
  rows: BenchmarkRow[];
};

export const metadata: Metadata = {
  title: "Benchmark",
};

export default async function BenchmarkPage() {
  const denied = await guardCapability("lab.run");
  if (denied) return denied;

  const { t, locale } = await getI18n();
  const res = await getBenchmarks();
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.benchmark.title} description={t.benchmark.subtitle} />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t.benchmark.subtitle}
          </CardContent>
        </Card>
      </div>
    );
  }
  const { meta, rows } = res.data as unknown as BenchmarkPayload;
  const best = {
    latency: Math.min(...rows.map((row) => row.latency_ms_p50)),
    throughput: Math.max(...rows.map((row) => row.throughput_ips)),
    memory: Math.min(...rows.map((row) => row.memory_mb)),
    accuracy: Math.max(...rows.map((row) => row.map50)),
  };
  const bestThroughput = rows.find((row) => row.throughput_ips === best.throughput);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.benchmark.title}
        description={t.benchmark.subtitle}
        actions={
          <ExportCsvButton
            filename="ShelfOpsRetail-benchmark.csv"
            label={t.benchmark.exportCta}
            rows={[
              [
                t.benchmark.platform,
                t.benchmark.runtime,
                t.benchmark.latency,
                t.benchmark.throughput,
                t.benchmark.memory,
                t.benchmark.accuracy,
              ],
              ...rows.map((row) => [
                row.platform,
                row.runtime,
                row.latency_ms_p50,
                row.throughput_ips,
                row.memory_mb,
                row.map50,
              ]),
            ]}
          />
        }
      />

      <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-subtle px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <p>{t.benchmark.note}</p>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <div className="flex gap-1.5">
              <dt className="font-medium text-foreground">
                {t.benchmark.testbedLabel}
              </dt>
              <dd>{meta.testbed}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-medium text-foreground">
                {t.benchmark.datasetLabel}
              </dt>
              <dd>{meta.image_set}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-medium text-foreground">
                {t.benchmark.testedAtLabel}
              </dt>
              <dd>{formatDateTime(meta.tested_at, locale)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {bestThroughput ? (
        <p className="text-sm text-muted-foreground">
          {t.benchmark.bestThroughput.replace("{platform}", bestThroughput.platform)}
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.benchmark.platform}</TableHead>
                <TableHead>{t.benchmark.runtime}</TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  {t.benchmark.latency}
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  {t.benchmark.throughput}
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  {t.benchmark.memory}
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  {t.benchmark.accuracy}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-foreground">
                    <span className="flex flex-wrap items-center gap-2">
                      {row.platform}
                      {row.id === rows[0]?.id ? (
                        <Badge variant="outline">{t.benchmark.baseline}</Badge>
                      ) : null}
                    </span>
                    <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                      {row.note}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.runtime}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "whitespace-nowrap text-right tabular-nums",
                      row.latency_ms_p50 === best.latency && "font-semibold text-foreground",
                    )}
                  >
                    {formatNumber(row.latency_ms_p50, locale)} ms
                  </TableCell>
                  <TableCell
                    className={cn(
                      "whitespace-nowrap text-right tabular-nums",
                      row.throughput_ips === best.throughput &&
                        "font-semibold text-foreground",
                    )}
                  >
                    {formatNumber(row.throughput_ips, locale)} img/s
                  </TableCell>
                  <TableCell
                    className={cn(
                      "whitespace-nowrap text-right tabular-nums",
                      row.memory_mb === best.memory && "font-semibold text-foreground",
                    )}
                  >
                    {formatNumber(row.memory_mb, locale)} MB
                  </TableCell>
                  <TableCell
                    className={cn(
                      "whitespace-nowrap text-right tabular-nums",
                      row.map50 === best.accuracy && "font-semibold text-foreground",
                    )}
                  >
                    {row.map50.toFixed(3)}
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
