"use client";

import type { AuditImage, Detection, Store } from "@shelfops/api-client";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { BboxPreview } from "@/components/bbox-preview";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import {
  Camera,
  Check,
  ImageIcon,
  Info,
  Warning,
} from "@/components/icons";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { API_BASE_URL } from "@/lib/demo";
import { formatBytes, formatNumber, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type {
  DetectionResult,
  DetectionResultIssue,
  DetectionResultIssueType,
  UiProblem,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const ACCEPTED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "svg"];
const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
];
const MAX_BYTES = 10 * 1024 * 1024;

const ISSUE_VARIANTS: Record<
  DetectionResultIssueType,
  "danger" | "warning" | "outline"
> = {
  oos: "danger",
  price_mismatch: "warning",
  gap: "warning",
  low_confidence: "outline",
};

type Step = 1 | 2 | 3;
type Phase = "uploading" | "detecting" | "scoring";

const PHASES: Phase[] = ["uploading", "detecting", "scoring"];

function fillTemplate(text: string, values: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

export function StartAudit({
  stores,
  demoMode,
  result,
}: {
  stores: Store[];
  demoMode: boolean;
  result: DetectionResult;
}) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [storeId, setStoreId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("uploading");
  const [error, setError] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<UiProblem | null>(null);
  const [saveError, setSaveError] = useState<UiProblem | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedStore = stores.find((store) => store.id === storeId);

  const groupedStores = useMemo(() => {
    const groups = new Map<string, Store[]>();
    for (const store of stores) {
      const region = store.region ?? "";
      const current = groups.get(region);
      if (current) current.push(store);
      else groups.set(region, [store]);
    }
    return [...groups.entries()];
  }, [stores]);

  const images = useMemo<AuditImage[]>(
    () => [
      {
        id: result.image.id,
        status: "done",
        width: result.image.width,
        height: result.image.height,
        url: result.image.url,
        attempts: 1,
      },
    ],
    [result.image],
  );

  const previewDetections = useMemo<Detection[]>(
    () =>
      result.detections.map((detection) => ({
        id: detection.id,
        image_id: result.image.id,
        bbox: [
          detection.bbox[0] * result.image.width,
          detection.bbox[1] * result.image.height,
          detection.bbox[2] * result.image.width,
          detection.bbox[3] * result.image.height,
        ],
        confidence: detection.confidence,
        label: detection.label,
        row_index: detection.row_index,
        source: detection.source,
      })),
    [result],
  );

  const detectionsByImage = useMemo(
    () => ({ [result.image.id]: previewDetections }),
    [result.image.id, previewDetections],
  );

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (step === 1) return;
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step !== 2 || !demoMode || analyzeError) return;
    const timers = [
      window.setTimeout(() => setPhase("detecting"), 520),
      window.setTimeout(() => setPhase("scoring"), 1180),
      window.setTimeout(() => setStep(3), 1800),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [step, demoMode, analyzeError]);

  const phaseIndex = PHASES.indexOf(phase);
  const progress = demoMode
    ? phase === "uploading"
      ? 32
      : phase === "detecting"
        ? 66
        : 92
    : 8;

  const phaseLabels: Record<Phase, string> = {
    uploading: t.startAudit.phaseUpload,
    detecting: t.startAudit.phaseDetect,
    scoring: t.startAudit.phaseScore,
  };

  const steps: { value: Step; label: string }[] = [
    { value: 1, label: t.startAudit.stepSelect },
    { value: 2, label: t.startAudit.stepAnalyze },
    { value: 3, label: t.startAudit.stepResult },
  ];

  const currency = (value: number | undefined) =>
    value === undefined
      ? "-"
      : formatNumber(value, locale, {
          style: "currency",
          currency: "IDR",
          maximumFractionDigits: 0,
        });

  function acceptFile(next: File | null) {
    setError(null);
    setAnalyzeError(null);
    setSaveError(null);
    if (!next) {
      setFile(null);
      return;
    }
    const extension = next.name.split(".").pop()?.toLowerCase() ?? "";
    const typeAccepted =
      ACCEPTED_MIME.includes(next.type) || ACCEPTED_EXTENSIONS.includes(extension);
    if (!typeAccepted) {
      setError(t.startAudit.errorType);
      return;
    }
    if (next.size > MAX_BYTES) {
      setError(t.startAudit.errorSize);
      return;
    }
    setFile(next);
  }

  function clearFile() {
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openPicker() {
    fileInputRef.current?.click();
  }

  function resetFlow() {
    setStep(1);
    setPhase("uploading");
    setError(null);
    setAnalyzeError(null);
    setSaveError(null);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function startAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAnalyzeError(null);
    setSaveError(null);
    if (!storeId) {
      setError(t.startAudit.errorStore);
      return;
    }
    if (!file) {
      setError(t.startAudit.errorFile);
      return;
    }
    setPhase("uploading");
    setStep(2);
    if (!demoMode) void analyzeLive(file);
  }

  async function readProblem(response: Response, requestId: string) {
    let title = t.startAudit.analyzeErrorTitle;
    let detail: string | undefined = fillTemplate(t.startAudit.gatewayStatus, {
      status: String(response.status),
    });
    let traceId =
      response.headers.get("x-trace-id") ??
      response.headers.get("x-request-id") ??
      requestId;
    try {
      const payload = (await response.json()) as {
        title?: string;
        detail?: string;
        trace_id?: string;
      };
      if (payload.title) title = payload.title;
      if (payload.detail) detail = payload.detail;
      if (payload.trace_id) traceId = payload.trace_id;
    } catch {
      // The gateway did not return a problem document.
    }
    return {
      title,
      detail,
      status: response.status,
      traceId,
      retryable: false,
    } satisfies UiProblem;
  }

async function analyzeLive(selectedFile: File) {
    const requestId = crypto.randomUUID();
    try {
      // 1) Buat sesi audit draft.
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/audits`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "X-Request-Id": requestId,
        },
        body: JSON.stringify({ store_id: storeId }),
      });
      if (!createResponse.ok) {
        setAnalyzeError(await readProblem(createResponse, requestId));
        return;
      }
      const session = (await createResponse.json()) as { id?: string };
      if (!session.id) {
        setAnalyzeError({
          title: t.startAudit.analyzeErrorTitle,
          detail: t.startAudit.analyzeErrorBody,
          status: 502,
          traceId: requestId,
          retryable: true,
        });
        return;
      }

      // 2) Unggah foto ke sesi tersebut.
      const form = new FormData();
      form.set("file", selectedFile);
      const uploadResponse = await fetch(
        `${API_BASE_URL}/api/v1/audits/${session.id}/images`,
        {
          method: "POST",
          credentials: "include",
          headers: { "X-Request-Id": requestId },
          body: form,
        },
      );
      if (!uploadResponse.ok) {
        setAnalyzeError(await readProblem(uploadResponse, requestId));
        return;
      }

      // 3) Jalankan deteksi. Endpoint menunggu hasil vision, jadi error
      //    (mis. ai-vision mati) tampil apa adanya, bukan sesi kosong.
      const startResponse = await fetch(
        `${API_BASE_URL}/api/v1/audits/${session.id}/start`,
        {
          method: "POST",
          credentials: "include",
          headers: { "X-Request-Id": requestId },
        },
      );
      if (!startResponse.ok) {
        setAnalyzeError(await readProblem(startResponse, requestId));
        return;
      }
      const summary = (await startResponse.json()) as {
        images_processed?: number;
        images_failed?: number;
        error?: string;
      };
      if ((summary.images_processed ?? 0) === 0) {
        setAnalyzeError({
          title: t.startAudit.analyzeErrorTitle,
          detail: summary.error ?? t.startAudit.analyzeErrorBody,
          status: 502,
          traceId: requestId,
          retryable: true,
        });
        return;
      }
      router.push(`/shelf/${session.id}`);
    } catch {
      setAnalyzeError({
        title: t.startAudit.analyzeErrorTitle,
        status: 0,
        traceId: requestId,
        retryable: false,
      });
    }
  }

  async function saveSession() {
    setSaveError(null);
    if (demoMode) {
      toast({ title: t.startAudit.saveDemoToast, variant: "success" });
      router.push(`/shelf/${result.session_id}`);
      return;
    }
    setSaving(true);
    const requestId = crypto.randomUUID();
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/sessions/${result.session_id}/save`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "X-Request-Id": requestId,
          },
          body: JSON.stringify({ store_id: storeId }),
        },
      );
      if (!response.ok) {
        const problem = await readProblem(response, requestId);
        setSaveError({ ...problem, title: t.startAudit.saveErrorTitle });
        return;
      }
      router.push(`/shelf/${result.session_id}`);
    } catch {
      setSaveError({
        title: t.startAudit.saveErrorTitle,
        detail: t.states.offlineBody,
        status: 0,
        traceId: requestId,
        retryable: false,
      });
    } finally {
      setSaving(false);
    }
  }

  function issueDetail(issue: DetectionResultIssue) {
    switch (issue.type) {
      case "oos":
        return fillTemplate(t.startAudit.issueDetailOos, {
          count: formatNumber(issue.facings ?? 0, locale),
          row: formatNumber(issue.row_index, locale),
        });
      case "price_mismatch":
        return fillTemplate(t.startAudit.issueDetailPrice, {
          actual: currency(issue.price_actual_idr),
          expected: currency(issue.price_expected_idr),
        });
      case "gap":
        return fillTemplate(t.startAudit.issueDetailGap, {
          count: formatNumber(issue.facings ?? 0, locale),
        });
      case "low_confidence":
        return fillTemplate(t.startAudit.issueDetailLowConfidence, {
          confidence: formatPercent((issue.confidence ?? 0) * 100, locale, 0),
        });
    }
  }

  const fileMeta = file
    ? [
        formatBytes(file.size, locale),
        (file.name.split(".").pop() ?? "?").toUpperCase(),
      ].join(" · ")
    : null;

  const channelLabel = selectedStore?.channel
    ? (t.channels[selectedStore.channel] ?? selectedStore.channel)
    : null;

  return (
    <div className="space-y-5">
      <ol
        className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border"
        aria-label={t.startAudit.stepLabel}
      >
        {steps.map((item) => {
          const active = step === item.value;
          const done = step > item.value;
          return (
            <li
              key={item.value}
              aria-current={active ? "step" : undefined}
              className={cn(
                "relative flex min-w-0 items-center gap-2 bg-background px-2.5 py-2.5 sm:px-3",
                active && "bg-surface-subtle",
              )}
            >
              <span
                className={cn(
                  "tabular flex size-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-medium",
                  done
                    ? "border-success-soft-border bg-success-soft text-success-strong"
                    : active
                      ? "border-accent bg-accent text-white"
                      : "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3" /> : item.value}
                {done ? (
                  <span className="sr-only">{t.startAudit.phaseDone}</span>
                ) : null}
              </span>
              <span
                className={cn(
                  "truncate text-xs",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>
              {active ? (
                <span
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-accent"
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <Card>
          <CardHeader className="border-b border-border">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {t.startAudit.selectTitle}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t.startAudit.selectBody}
            </p>
          </CardHeader>
          <CardContent className="pt-5">
            <form
              onSubmit={startAnalysis}
              className="grid gap-5 lg:grid-cols-12"
            >
              <div className="space-y-3 lg:col-span-5">
                <div className="space-y-1.5">
                  <Label htmlFor="audit-store">{t.startAudit.storeLabel}</Label>
                  <select
                    id="audit-store"
                    value={storeId}
                    onChange={(event) => setStoreId(event.target.value)}
                    aria-describedby="audit-store-help"
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 sm:h-9"
                  >
                    <option value="">{t.startAudit.storePlaceholder}</option>
                    {groupedStores.map(([region, regionStores]) => (
                      <optgroup
                        key={region || "unknown"}
                        label={region || t.common.notAvailable}
                      >
                        {regionStores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p
                    id="audit-store-help"
                    className="text-[11px] text-muted-foreground"
                  >
                    {t.startAudit.storeHelp}
                  </p>
                </div>

                {selectedStore ? (
                  <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2.5">
                    <p className="text-xs font-medium text-foreground">
                      {selectedStore.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {[
                        selectedStore.code,
                        selectedStore.region,
                        channelLabel,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 lg:col-span-7">
                <Label htmlFor="audit-photo">{t.startAudit.photoLabel}</Label>
                <input
                  ref={fileInputRef}
                  id="audit-photo"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.svg,image/jpeg,image/png,image/webp,image/svg+xml"
                  tabIndex={-1}
                  onChange={(event) => {
                    acceptFile(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                  className="sr-only"
                  aria-label={t.startAudit.photoLabel}
                />

                {file ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {file.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {fileMeta}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={openPicker}
                        >
                          {t.startAudit.changePhoto}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={clearFile}
                        >
                          {t.startAudit.removePhoto}
                        </Button>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-border bg-muted">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={`${t.startAudit.previewAlt}: ${file.name}`}
                          className="mx-auto block max-h-[360px] w-full object-contain"
                        />
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openPicker}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setDragging(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node | null,
                        )
                      ) {
                        setDragging(false);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      acceptFile(event.dataTransfer.files?.[0] ?? null);
                    }}
                    aria-describedby="audit-drop-help"
                    className={cn(
                      "flex min-h-56 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-5 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      dragging
                        ? "border-accent bg-accent-soft"
                        : "border-border-strong bg-surface-subtle hover:border-muted-foreground/50 hover:bg-muted",
                    )}
                  >
                    <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
                      <Camera className="size-5" />
                    </span>
                    <span className="space-y-1">
                      <span className="block text-sm font-medium text-foreground">
                        {t.startAudit.dropTitle}
                      </span>
                      <span
                        id="audit-drop-help"
                        className="block text-xs text-muted-foreground"
                      >
                        {t.startAudit.dropBody}
                      </span>
                    </span>
                    <span className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground">
                      {t.startAudit.choosePhoto}
                    </span>
                  </button>
                )}

                {error ? (
                  <p
                    role="alert"
                    className="flex items-start gap-1.5 text-sm text-danger-strong"
                  >
                    <Warning className="mt-0.5 size-4 shrink-0" />
                    {error}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between lg:col-span-12">
                {demoMode ? (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    {t.startAudit.demoNote}
                  </p>
                ) : (
                  <span />
                )}
                <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
                  <Button
                    type="submit"
                    disabled={!file || !storeId}
                    className="w-full disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 sm:w-auto"
                  >
                    <Camera />
                    {t.startAudit.analyzeCta}
                  </Button>
                  {!file || !storeId ? (
                    <p className="text-[11px] text-muted-foreground sm:text-right">
                      {t.startAudit.analyzeHint}
                    </p>
                  ) : null}
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="space-y-5 lg:col-span-7">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {fillTemplate(t.startAudit.stepProgress, {
                      current: "2",
                      total: "3",
                    })}
                  </p>
                  <h2
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-lg font-semibold tracking-tight text-foreground"
                  >
                    {t.startAudit.analyzingTitle}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t.startAudit.analyzingBody}
                  </p>
                </div>

                {analyzeError ? (
                  <div className="space-y-3">
                    <ErrorState
                      error={analyzeError}
                      title={t.startAudit.analyzeErrorTitle}
                      body={t.startAudit.analyzeErrorBody}
                      retry={false}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={resetFlow}
                    >
                      {t.startAudit.editCta}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <p
                          className="text-sm font-medium text-foreground"
                          aria-live="polite"
                          aria-atomic="true"
                        >
                          {demoMode
                            ? phaseLabels[phase]
                            : t.startAudit.waitingGateway}
                        </p>
                        {demoMode ? (
                          <span className="tabular text-xs text-muted-foreground">
                            {progress}%
                          </span>
                        ) : null}
                      </div>
                      <Progress
                        value={progress}
                        label={
                          demoMode
                            ? phaseLabels[phase]
                            : t.startAudit.waitingGateway
                        }
                      />
                    </div>

                    <ol className="space-y-3">
                      {PHASES.map((item, index) => {
                        const state =
                          index < phaseIndex
                            ? "done"
                            : index === phaseIndex
                              ? "active"
                              : "pending";
                        return (
                          <li
                            key={item}
                            className="flex items-center gap-3"
                          >
                            <span
                              className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-md border",
                                state === "done"
                                  ? "border-success-soft-border bg-success-soft text-success-strong"
                                  : state === "active"
                                    ? "border-accent-soft-border bg-accent-soft text-accent-strong"
                                    : "border-border text-muted-foreground",
                              )}
                            >
                              {state === "done" ? (
                                <Check className="size-3.5" />
                              ) : (
                                <span
                                  className={cn(
                                    "size-1.5 rounded-full",
                                    state === "active"
                                      ? "bg-accent"
                                      : "bg-border",
                                  )}
                                />
                              )}
                            </span>
                            <p
                              className={cn(
                                "min-w-0 flex-1 text-sm",
                                state === "pending"
                                  ? "text-muted-foreground"
                                  : "font-medium text-foreground",
                              )}
                            >
                              {phaseLabels[item]}
                            </p>
                            <span className="text-[11px] text-muted-foreground">
                              {state === "done"
                                ? t.startAudit.phaseDone
                                : state === "active"
                                  ? t.startAudit.phaseActive
                                  : t.startAudit.phasePending}
                            </span>
                          </li>
                        );
                      })}
                    </ol>

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={resetFlow}
                    >
                      {t.startAudit.cancel}
                    </Button>
                  </>
                )}
              </div>

              <div className="lg:col-span-5">
                {previewUrl ? (
                  <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
                    <img
                      src={previewUrl}
                      alt={`${t.startAudit.previewAlt}: ${file?.name ?? ""}`}
                      className="block max-h-[320px] w-full object-contain"
                    />
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded bg-background/95 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      <ImageIcon className="size-3.5" />
                      {t.startAudit.photoLabel}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <section className="space-y-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="text-lg font-semibold tracking-tight text-foreground"
              >
                {t.startAudit.resultTitle}
              </h2>
              {demoMode ? (
                <Badge variant="outline">{t.startAudit.resultDemo}</Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {t.startAudit.resultBody}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-muted-foreground">
              {selectedStore ? (
                <span className="font-medium text-foreground">
                  {selectedStore.name}
                </span>
              ) : null}
              <span aria-hidden="true">·</span>
              <span>{result.planogram_name}</span>
              <span aria-hidden="true">·</span>
              <span>
                {formatNumber(1, locale)} {t.startAudit.imageCount}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {formatNumber(result.detections.length, locale)}{" "}
                {t.startAudit.detectionsCount}
              </span>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader className="border-b border-border">
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  {t.sessions.scoreTitle}
                </h3>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-baseline gap-1">
                    <span className="tabular text-[30px] font-semibold leading-9 tracking-tight text-foreground">
                      {formatNumber(result.score, locale)}
                    </span>
                    <span className="text-sm text-muted-foreground">/100</span>
                  </div>
                  <Badge
                    variant={result.score >= 90 ? "success" : "warning"}
                  >
                    {result.score >= 90
                      ? t.startAudit.scoreGood
                      : t.startAudit.scoreReview}
                  </Badge>
                </div>
                <Progress
                  value={result.score}
                  className="mt-3"
                  label={t.sessions.scoreTitle}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {t.sessions.scoreNote}
                </p>

                <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
                  {[
                    {
                      label: t.sessions.facingTotal,
                      value: result.metrics.facing_total,
                    },
                    {
                      label: t.sessions.oosCount,
                      value: result.metrics.oos_count,
                    },
                    {
                      label: t.sessions.priceMismatch,
                      value: result.metrics.price_mismatch,
                    },
                    {
                      label: t.startAudit.metricGap,
                      value: result.metrics.facing_gap,
                    },
                  ].map((item) => (
                    <div key={item.label} className="bg-background p-3">
                      <dt className="text-[11px] text-muted-foreground">
                        {item.label}
                      </dt>
                      <dd className="tabular mt-1 text-base font-semibold text-foreground">
                        {formatNumber(item.value, locale)}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-5 border-t border-border pt-4">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    {t.sessions.breakdownTitle}
                  </h4>
                  <dl className="mt-3 space-y-3">
                    {[
                      {
                        label: t.sessions.availability,
                        value: result.breakdown.availability,
                      },
                      {
                        label: t.sessions.shareAdherence,
                        value: result.breakdown.share_adherence,
                      },
                      {
                        label: t.sessions.priceAccuracy,
                        value: result.breakdown.price_accuracy,
                      },
                    ].map((item) => (
                      <div key={item.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <dt className="text-muted-foreground">
                            {item.label}
                          </dt>
                          <dd className="tabular font-medium text-foreground">
                            {formatPercent(item.value * 100, locale)}
                          </dd>
                        </div>
                        <Progress
                          value={item.value * 100}
                          label={item.label}
                        />
                      </div>
                    ))}
                  </dl>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader className="border-b border-border">
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  {t.startAudit.previewTitle}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t.startAudit.previewBody}
                </p>
              </CardHeader>
              <CardContent className="pt-5">
                <BboxPreview
                  images={images}
                  detectionsByImage={detectionsByImage}
                  demoMode={demoMode}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="border-b border-border">
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {t.startAudit.issuesTitle}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t.startAudit.issuesBody}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {result.issues.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title={t.startAudit.noIssuesTitle}
                    body={t.startAudit.noIssuesBody}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.startAudit.issueFinding}</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        {t.startAudit.issueRow}
                      </TableHead>
                      <TableHead>{t.startAudit.issueDetail}</TableHead>
                      <TableHead className="text-right">
                        {t.startAudit.issueSeverity}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.issues.map((issue) => (
                      <TableRow key={issue.id}>
                        <TableCell className="align-top">
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant={ISSUE_VARIANTS[issue.type]}>
                              {t.startAudit.issueTypes[issue.type]}
                            </Badge>
                            <span className="text-xs font-medium text-foreground">
                              {issue.label}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="tabular hidden align-top text-muted-foreground sm:table-cell">
                          {formatNumber(issue.row_index, locale)}
                        </TableCell>
                        <TableCell className="min-w-[220px] whitespace-normal align-top text-sm text-muted-foreground">
                          {issueDetail(issue)}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <StatusBadge
                            kind="severity"
                            value={issue.severity}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={resetFlow}
              className="w-full sm:w-auto"
            >
              {t.startAudit.againCta}
            </Button>
            <Button
              type="button"
              onClick={() => void saveSession()}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving ? t.startAudit.savingSession : t.startAudit.saveCta}
            </Button>
          </div>

          {saveError ? (
            <ErrorState
              error={saveError}
              title={t.startAudit.saveErrorTitle}
              body={t.startAudit.saveErrorBody}
              retry={false}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

