import type { Metadata } from "next";
import Link from "next/link";

import { ChevronRight } from "@/components/icons";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getI18n } from "@/lib/i18n/server";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { getTraces } from "@/lib/data";
import { guardCapability } from "@/lib/guard";

export const metadata: Metadata = {
  title: "Trace",
};

const STATUS_VARIANT = {
  success: "success",
  refused: "warning",
  tool_call: "outline",
  error: "danger",
} as const;

type TraceListRow = {
  id: string;
  request_id: string;
  status: string;
  created_at?: string;
  query: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  cost_idr: number;
  model: string;
  user: string;
};

type TraceListPayload = { traces: TraceListRow[] };

export default async function TracesPage() {
  const denied = await guardCapability("lab.run");
  if (denied) return denied;

  const { t, locale } = await getI18n();
  const res = await getTraces();
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.traces.title} description={t.traces.subtitle} />
        <ErrorState error={res.error} />
      </div>
    );
  }
  const traces = (res.data as TraceListPayload).traces.map((trace) => ({
    ...trace,
    id: trace.request_id ?? trace.id,
    status:
      trace.status === "ok" || trace.status === "success"
        ? "success"
        : trace.status,
  }));
  const statusCounts = traces.reduce<Record<string, number>>((acc, trace) => {
    acc[trace.status] = (acc[trace.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader title={t.traces.title} description={t.traces.subtitle} />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular font-medium text-foreground">
          {traces.length} {t.traces.count}
        </span>
        {Object.entries(statusCounts).map(([status, count]) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true">·</span>
            <span
              className={
                status === "error"
                  ? "font-medium text-danger-strong"
                  : status === "refused"
                    ? "font-medium text-warning-strong"
                    : undefined
              }
            >
              {count} {t.traces.statuses[status as keyof typeof t.traces.statuses]}
            </span>
          </span>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">ID</TableHead>
                <TableHead className="w-[26%]">{t.traces.query}</TableHead>
                <TableHead className="w-32">{t.traces.status}</TableHead>
                <TableHead className="w-24 whitespace-nowrap text-right">
                  {t.traces.latency}
                </TableHead>
                <TableHead className="w-20 whitespace-nowrap text-right">
                  {t.traces.tokens}
                </TableHead>
                <TableHead className="w-24 whitespace-nowrap text-right">
                  {t.traces.cost}
                </TableHead>
                <TableHead className="w-40 whitespace-nowrap">
                  {t.traces.createdAt}
                </TableHead>
                <TableHead aria-label={t.traces.openTrace} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {traces.map((trace) => (
                <TableRow key={trace.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {trace.id}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/traces/${trace.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {trace.query}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        STATUS_VARIANT[
                          trace.status as keyof typeof STATUS_VARIANT
                        ] ?? "outline"
                      }
                    >
                      {
                        t.traces.statuses[
                          trace.status as keyof typeof t.traces.statuses
                        ]
                      }
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {formatNumber(trace.latency_ms, locale)} ms
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {formatNumber(trace.tokens_in + trace.tokens_out, locale)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {formatCurrency(trace.cost_idr, locale)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(trace.created_at, locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip label={t.lab.openTrace}>
                        <Button asChild variant="secondary" size="icon" aria-label={`${t.lab.openTrace}: ${trace.id}`}>
                          <Link href={`/traces/${trace.id}`}>
                            <ChevronRight className="text-accent" />
                          </Link>
                        </Button>
                      </Tooltip>
                    </div>
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
