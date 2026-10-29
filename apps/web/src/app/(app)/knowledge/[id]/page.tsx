import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, FileText } from "@/components/icons";
import { ChunkInspector } from "@/components/chunk-inspector";
import { ErrorState } from "@/components/error-state";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getDocument, getDocumentChunks } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { formatBytes, formatDateTime, formatNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: "Inspektur chunk",
};

const EMBEDDING_LABEL: Record<string, string> = {
  ready: "Embedding siap",
  pending: "Embedding tertunda",
  partial: "Embedding sebagian",
  missing: "Belum ada chunk",
};

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { t, locale } = await getI18n();

  const [documentResult, chunksResult] = await Promise.all([
    getDocument(id),
    getDocumentChunks(id),
  ]);

  if (!documentResult.ok) {
    if (documentResult.error.status === 404) notFound();
    return (
      <div className="space-y-6">
        <Link
          href="/knowledge"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t.chunkInspector.backToKnowledge}
        </Link>
        <ErrorState
          error={documentResult.error}
          title={t.chunkInspector.unavailableTitle}
          body={documentResult.error.detail ?? t.chunkInspector.unavailableBody}
        />
      </div>
    );
  }

  const document = documentResult.data;
  const chunks = chunksResult.ok ? chunksResult.data : [];
  const chunkError = chunksResult.ok ? null : chunksResult.error;

  return (
    <div className="space-y-6">
      <Link
        href="/knowledge"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t.chunkInspector.backToKnowledge}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              {document.title}
            </h1>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="outline" className="font-mono text-[11px]">
              v{document.current_version}
            </Badge>
            <StatusBadge kind="document" value={document.status} />
            <span className="font-mono text-xs">{document.mime}</span>
            <span>{formatBytes(document.size_bytes, locale)}</span>
            <span>
              {formatNumber(document.chunk_count, locale)}{" "}
              {t.chunkInspector.chunkCount}
            </span>
            <span>{formatDateTime(document.updated_at, locale)}</span>
            <Badge
              variant={document.embedding_status === "ready" ? "success" : "warning"}
            >
              {EMBEDDING_LABEL[document.embedding_status] ?? document.embedding_status}
            </Badge>
          </div>
        </div>
      </div>

      {document.error ? (
        <Card>
          <CardContent className="p-4 text-sm text-danger-strong">
            {document.error}
          </CardContent>
        </Card>
      ) : null}

      {chunkError ? (
        <ErrorState
          error={chunkError}
          title="Chunk gagal dimuat"
          body={chunkError.detail ?? "Indeks chunk belum tersedia untuk dokumen ini."}
        />
      ) : (
        <ChunkInspector
          chunks={chunks.map((chunk) => ({
            id: chunk.id,
            page: chunk.page ?? 0,
            heading: chunk.heading_path,
            tokens: chunk.token_count,
            text: chunk.content,
          }))}
          versions={document.versions.map((version) => ({
            version: `v${version.version}`,
            status: version.status,
            chunks:
              version.version === document.current_version ? chunks.length : 0,
            created_at: version.created_at,
          }))}
          totalChunks={document.chunk_count}
        />
      )}
    </div>
  );
}
