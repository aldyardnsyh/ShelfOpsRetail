import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, Copy } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getI18n } from "@/lib/i18n/server";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { getTrace } from "@/lib/data";
import { guardCapability } from "@/lib/guard";

export const metadata: Metadata = {
  title: "Detail trace",
};

const STATUS_VARIANT = {
  success: "success",
  refused: "warning",
  tool_call: "outline",
  error: "danger",
} as const;

// TraceStepOut adalah bentuk langkah dari /api/v1/traces/{requestId}.
type TraceStepOut = {
  stage: string;
  span_id: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  model?: string | null;
  provider?: string | null;
  status: string;
  meta?: Record<string, unknown>;
};

type TraceDetailPayload = {
  request_id: string;
  created_at: string;
  query: string;
  latency_ms: number;
  steps: TraceStepOut[];
  answer: string;
  citations: unknown[];
};

function stageToTitleKey(stage: string): "stepRetrieve" | "stepRerank" | "stepGenerate" | "stepTool" {
  switch (stage) {
    case "rewrite":
      return "stepRetrieve";
    case "tool":
      return "stepTool";
    case "llm":
    case "assistant":
      return "stepGenerate";
    default:
      return "stepRetrieve";
  }
}

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await guardCapability("lab.run");
  if (denied) return denied;

  const { id } = await params;
  const { t, locale } = await getI18n();
  const res = await getTrace(id);
  if (!res.ok) {
    notFound();
  }

  const trace = res.data as unknown as TraceDetailPayload;
  const status =
    trace.steps.some((step) => step.status !== "ok") ? "error" : "success";
  const tokensIn = trace.steps.reduce((acc, step) => acc + step.tokens_in, 0);
  const tokensOut = trace.steps.reduce((acc, step) => acc + step.tokens_out, 0);
  const costIDR = trace.steps.reduce((acc, step) => acc + step.cost_usd * 15500, 0);
  const model =
    trace.steps.find((step) => step.model)?.model ?? "—";
  // Sitasi trace diambil dari meta langkah answer bila tersedia (array kosong di data saat ini).
  const citations = Array.isArray(trace.citations) ? trace.citations : [];

  return (
    <div className="space-y-6">
      <Link
        href="/traces"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t.traces.backToTraces}
      </Link>

      <PageHeader
        title={t.traces.detailTitle}
        description={trace.query}
        meta={
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-mono text-xs">
              {trace.request_id}
              <Copy className="size-3.5" aria-hidden="true" />
            </span>
            <Badge
              variant={
                STATUS_VARIANT[status as keyof typeof STATUS_VARIANT] ?? "outline"
              }
            >
              {t.traces.statuses[status as keyof typeof t.traces.statuses]}
            </Badge>
            <span>{formatDateTime(trace.created_at, locale)}</span>
            <span>{model}</span>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: t.traces.latency,
            value: (
              <>
                {formatNumber(trace.latency_ms, locale)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">ms</span>
              </>
            ),
          },
          {
            label: t.traces.tokens,
            value: (
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span>
                  {formatNumber(tokensIn, locale)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {t.traces.tokensIn}
                  </span>
                </span>
                <span>
                  {formatNumber(tokensOut, locale)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {t.traces.tokensOut}
                  </span>
                </span>
              </span>
            ),
          },
          { label: t.traces.cost, value: formatCurrency(costIDR, locale) },
          { label: t.traces.actor, value: "Copilot" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t.traces.steps}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4">
            {trace.steps.map((step, index) => {
              const detail =
                typeof step.meta?.note === "string" ? (step.meta.note as string) : step.stage;
              return (
                <li key={step.span_id} className="flex gap-3">
                  <span
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-subtle text-xs font-medium tabular-nums text-muted-foreground"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 border-b border-border pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {t.traces[stageToTitleKey(step.stage)]}
                      </p>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatNumber(step.latency_ms, locale)} ms
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (step.latency_ms /
                                Math.max(1, trace.latency_ms)) *
                                100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {citations.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t.traces.citations}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {citations.map((citation, index) => {
              const c = citation as {
                id?: string;
                document_title?: string;
                chunk_id?: string;
                page?: number;
                score?: number;
                excerpt?: string;
              };
              return (
                <div
                  key={c.id ?? index}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="text-sm font-medium text-foreground">
                    {c.document_title ?? "—"}
                  </p>
                  <dl className="mt-1.5 grid grid-cols-[7rem_5rem_4rem] gap-x-3 text-xs text-muted-foreground">
                    <div className="flex gap-1.5">
                      <dt className="sr-only">{t.traces.chunkRef}</dt>
                      <dd className="tabular font-mono">{c.chunk_id ?? "—"}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="sr-only">{t.chunkInspector.page}</dt>
                      <dd className="tabular">{t.chunkInspector.page} {c.page ?? "—"}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="sr-only">{t.common.score}</dt>
                      <dd className="tabular">{formatNumber(c.score ?? 0, locale)}</dd>
                    </div>
                  </dl>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    &ldquo;{c.excerpt ?? ""}&rdquo;
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
