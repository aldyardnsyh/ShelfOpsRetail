import type { Detection } from "@shelfops/api-client";
import type { Metadata } from "next";
import Link from "next/link";

import { BboxPreview } from "@/components/bbox-preview";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ArrowLeft, Warning } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAuditDetail } from "@/lib/data";
import { DEMO_MODE } from "@/lib/demo";
import {
  formatDate,
  formatNumber,
  formatPercent,
  shortId,
} from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Hasil pemantauan",
};

export default async function ShelfDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { t, locale } = await getI18n();
  const detail = await getAuditDetail(id);

  if (!detail.ok) {
    return (
      <div className="space-y-6">
        <Link
          href="/shelf"
          className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft className="size-3.5" />
          {t.sessions.backToShelf}
        </Link>
        <PageHeader
          title={t.sessions.unavailableTitle}
          description={t.sessions.unavailableBody}
        />
        <ErrorState error={detail.error} />
      </div>
    );
  }

  const { session, images, metrics, detections_by_image: detectionsByImage } =
    detail.data;

  const detections: { imageIndex: number; detection: Detection }[] = [];
  images.forEach((image, imageIndex) => {
    for (const detection of detectionsByImage?.[image.id] ?? []) {
      detections.push({ imageIndex, detection });
    }
  });

  const breakdown = metrics.breakdown;
  const weights = breakdown?.weights;
  const rows = breakdown?.rows ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/shelf"
          className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft className="size-3.5" />
          {t.sessions.backToShelf}
        </Link>
      </div>

      <PageHeader
        title={session.store_name ?? t.sessions.detailTitle}
        description={`${t.sessions.detailTitle} ${shortId(session.id)}`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="session" value={session.status} />
            <Badge variant="outline">
              {session.planogram_name ?? t.sessions.planogram}
            </Badge>
            <Badge variant="outline">
              {formatDate(session.created_at, locale)}
            </Badge>
          </div>
        }
      />

      {session.status === "partial" || (session.failed_count ?? 0) > 0 ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-warning-soft-border bg-warning-soft p-3 text-sm text-warning-strong"
          role="status"
        >
          <Warning className="mt-0.5 size-4 shrink-0" />
          <span>{t.sessions.partialNotice}</span>
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="border-b border-border">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {t.sessions.bboxPreview}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t.sessions.imagesSubtitle}
            </p>
          </CardHeader>
          <CardContent className="pt-5">
            <BboxPreview
              images={images}
              detectionsByImage={detectionsByImage ?? {}}
              demoMode={DEMO_MODE}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <div className="p-5">
            <p className="text-xs font-medium text-muted-foreground">
              {t.sessions.scoreTitle}
            </p>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="tabular text-[30px] font-semibold leading-9 tracking-tight text-foreground">
                {metrics.compliance_score ?? session.score ?? "-"}
              </span>
              <span className="text-sm text-muted-foreground">/100</span>
            </div>
            <Progress
              value={metrics.compliance_score ?? session.score ?? 0}
              className="mt-3"
              label={t.sessions.scoreTitle}
            />
            <p className="mt-2 text-xs text-muted-foreground">{t.sessions.scoreNote}</p>
            {weights?.availability !== undefined &&
            weights?.share_adherence !== undefined &&
            weights?.price_accuracy !== undefined ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t.sessions.scoreFormula
                  .replace(
                    "{availability}",
                    weights.availability.toFixed(1).replace(".", ","),
                  )
                  .replace(
                    "{share}",
                    weights.share_adherence.toFixed(1).replace(".", ","),
                  )
                  .replace(
                    "{price}",
                    weights.price_accuracy.toFixed(1).replace(".", ","),
                  )}
              </p>
            ) : null}

            <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
              {[
                { label: t.sessions.facingTotal, value: metrics.facing_total },
                { label: t.sessions.oosCount, value: metrics.oos_count },
                { label: t.sessions.priceMismatch, value: metrics.price_mismatch },
                { label: t.sessions.priceRead, value: metrics.price_read },
              ].map((item) => (
                <div key={item.label} className="bg-background p-3">
                  <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
                  <dd className="tabular mt-1 text-base font-semibold text-foreground">
                    {formatNumber(item.value, locale)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="border-t border-border p-5">
            <h3 className="text-xs font-medium text-muted-foreground">
              {t.sessions.breakdownTitle}
            </h3>
            <dl className="mt-3 space-y-3">
              {[
                {
                  label: t.sessions.availability,
                  value: breakdown?.availability,
                  weight: weights?.availability,
                },
                {
                  label: t.sessions.shareAdherence,
                  value: breakdown?.share_adherence,
                  weight: weights?.share_adherence,
                },
                {
                  label: t.sessions.priceAccuracy,
                  value: breakdown?.price_accuracy,
                  weight: weights?.price_accuracy,
                },
              ].map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <dt className="text-muted-foreground">
                      {item.label}
                      {item.weight !== undefined ? (
                        <span className="tabular ml-1 text-muted-foreground/80">
                          ×{item.weight.toFixed(1).replace(".", ",")}
                        </span>
                      ) : null}
                    </dt>
                    <dd className="tabular font-medium text-foreground">
                      {item.value === undefined
                        ? "-"
                        : formatPercent(item.value * 100, locale)}
                    </dd>
                  </div>
                  <Progress
                    value={(item.value ?? 0) * 100}
                    label={item.label}
                  />
                </div>
              ))}
            </dl>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="rows">
        <TabsList>
          <TabsTrigger value="rows">{t.sessions.tabRows}</TabsTrigger>
          <TabsTrigger value="detections">{t.sessions.tabDetections}</TabsTrigger>
        </TabsList>

        <TabsContent value="rows">
          <Card>
            <CardHeader className="border-b border-border">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {t.sessions.rowsTitle}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t.sessions.detailSubtitle}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title={t.sessions.noDetectionsTitle}
                    body={t.sessions.noDetectionsBody}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.sessions.row}</TableHead>
                      <TableHead className="text-right">{t.sessions.rowFacing}</TableHead>
                      <TableHead className="text-right">{t.sessions.rowMissing}</TableHead>
                      <TableHead className="text-right">
                        {t.sessions.rowShareActual}
                      </TableHead>
                      <TableHead className="text-right">
                        {t.sessions.rowShareTarget}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.row_index}>
                        <TableCell className="font-medium">{row.row_index}</TableCell>
                        <TableCell className="tabular text-right">
                          {formatNumber(row.facing, locale)}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          <span
                            className={
                              (row.missing ?? 0) > 0
                                ? "font-medium text-danger-strong"
                                : "text-muted-foreground"
                            }
                          >
                            {formatNumber(row.missing, locale)}
                          </span>
                        </TableCell>
                        <TableCell className="tabular text-right text-muted-foreground">
                          {row.share_actual === undefined
                            ? "-"
                            : formatPercent(row.share_actual * 100, locale)}
                        </TableCell>
                        <TableCell className="tabular text-right text-muted-foreground">
                          {row.share_target === undefined
                            ? "-"
                            : formatPercent(row.share_target * 100, locale)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detections">
          <Card>
            <CardHeader className="border-b border-border">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {t.sessions.detectionsTitle}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t.sessions.imagesSubtitle}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {detections.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title={t.sessions.noDetectionsTitle}
                    body={t.sessions.noDetectionsBody}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.sessions.images}</TableHead>
                      <TableHead>{t.sessions.detectionLabel}</TableHead>
                      <TableHead>{t.sessions.row}</TableHead>
                      <TableHead className="text-right">{t.sessions.confidence}</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        {t.sessions.source}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detections.map(({ imageIndex, detection }) => (
                      <TableRow key={detection.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {imageIndex + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {detection.label ?? "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {detection.row_index ?? "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={detection.confidence < 0.8 ? "warning" : "outline"}
                          >
                            {formatPercent(detection.confidence * 100, locale, 0)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {t.status.source[detection.source] ?? detection.source}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

