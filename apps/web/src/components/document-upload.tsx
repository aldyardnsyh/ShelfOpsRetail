"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Upload, Warning } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { API_BASE_URL } from "@/lib/demo";
import { useI18n } from "@/lib/i18n/client";

const ALLOWED_EXTENSIONS = ["pdf", "docx", "md", "txt"];
const MAX_BYTES = 20 * 1024 * 1024;

type Phase = "idle" | "uploading";

async function readDetail(response: Response) {
  try {
    const body = (await response.json()) as { detail?: string };
    return body.detail;
  } catch {
    return undefined;
  }
}

export function DocumentUpload({ demoMode }: { demoMode: boolean }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<"id" | "en">("id");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = phase !== "idle";

  function selectFile(next: File | null) {
    setError(null);
    if (!next) {
      setFile(null);
      return;
    }
    const extension = next.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setError(t.knowledge.uploadTypeError);
      setFile(null);
      return;
    }
    if (next.size > MAX_BYTES) {
      setError(t.knowledge.uploadSizeError);
      setFile(null);
      return;
    }
    setFile(next);
    if (!title) {
      setTitle(next.name.replace(/\.[^.]+$/, ""));
    }
  }

  async function upload() {
    if (!file) {
      setError(t.knowledge.noFile);
      return;
    }
    setError(null);
    setPhase("uploading");

    try {
      // Gateway menerima multipart langsung: validasi magic byte, simpan ke
      // object store, catat versi, lalu antrekan kb_ingest. Satu permintaan
      // lebih jujur daripada slot upload dua tahap yang tidak ada di backend.
      const form = new FormData();
      form.set("file", file);
      const trimmedTitle = title.trim();
      if (trimmedTitle) form.set("title", trimmedTitle);
      form.set("language", language);

      const response = await fetch(`${API_BASE_URL}/api/v1/documents/upload`, {
        method: "POST",
        credentials: "include",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: form,
      });
      if (!response.ok) {
        throw new Error((await readDetail(response)) ?? t.knowledge.uploadError);
      }
      const created = (await response.json()) as {
        degradation?: string;
      };

      toast({
        title: t.knowledge.uploadSuccess,
        description:
          created.degradation === "ai_rag_unavailable"
            ? "Dokumen tersimpan; indeks AI tertunda karena layanan RAG belum tersedia."
            : undefined,
        variant: "success",
      });
      setFile(null);
      setTitle("");
      setPhase("idle");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (uploadError) {
      setPhase("idle");
      const message =
        uploadError instanceof Error ? uploadError.message : t.knowledge.uploadError;
      setError(message);
      toast({
        title: t.knowledge.uploadError,
        description: message,
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-4">
      {demoMode ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-border bg-surface-subtle p-3 text-sm text-muted-foreground"
          role="status"
        >
          <Warning className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium text-foreground">{t.knowledge.demoTitle}.</span>{" "}
            {t.knowledge.demoBody}
          </span>
        </div>
      ) : null}

      <form
        className="grid gap-3 lg:grid-cols-12 lg:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (!demoMode) void upload();
        }}
      >
        <div className="space-y-1.5 lg:col-span-4">
          <Label htmlFor="document-file" className="sr-only">
            {t.knowledge.chooseFile}
          </Label>
          <Input
            ref={fileRef}
            id="document-file"
            type="file"
            accept=".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
            disabled={demoMode || busy}
            onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            className="sr-only"
          />
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-subtle px-3 py-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={demoMode || busy}
              className="disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
              onClick={() => fileRef.current?.click()}
            >
              {t.knowledge.chooseFile}
            </Button>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {file ? file.name : t.knowledge.noFile}
            </span>
          </div>
          {file ? (
            <p className="text-[11px] text-muted-foreground">
              {Math.ceil(file.size / 1024)} KB
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5 lg:col-span-4">
          <Label htmlFor="document-title">{t.knowledge.titleLabel}</Label>
          <Input
            id="document-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t.knowledge.titlePlaceholder}
            disabled={demoMode || busy}
            maxLength={200}
          />
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor="document-language">{t.knowledge.languageLabel}</Label>
          <select
            id="document-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "id")}
            disabled={demoMode || busy}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground sm:h-9"
          >
            <option value="id">{t.knowledge.languageId}</option>
            <option value="en">{t.knowledge.languageEn}</option>
          </select>
        </div>
        <div className="lg:col-span-2">
          <Button
            type="submit"
            className="w-full disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
            disabled={demoMode || busy || !file}
          >
            <Upload />
            {busy ? t.knowledge.uploading : t.knowledge.uploadCta}
          </Button>
        </div>
      </form>

      {busy ? (
        <div className="space-y-1.5" aria-live="polite">
          <p className="text-xs text-muted-foreground">
            {phase === "uploading" ? "Mengunggah dan memvalidasi file" : "Menyelesaikan"}
          </p>
          <Progress value={phase === "uploading" ? 55 : 90} />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}
