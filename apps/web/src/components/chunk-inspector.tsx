"use client";

import { useMemo, useState } from "react";

import { Search } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime, formatNumber } from "@/lib/format";

export interface ChunkInspectorChunk {
  id: string;
  page: number;
  heading: string;
  tokens: number;
  text: string;
}

export interface ChunkInspectorVersion {
  version: string;
  status: string;
  chunks: number;
  created_at: string;
}

export function ChunkInspector({
  chunks,
  versions,
  totalChunks,
}: {
  chunks: ChunkInspectorChunk[];
  versions: ChunkInspectorVersion[];
  totalChunks: number;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return chunks;
    return chunks.filter(
      (chunk) =>
        chunk.text.toLowerCase().includes(term) ||
        chunk.heading.toLowerCase().includes(term) ||
        chunk.id.toLowerCase().includes(term),
    );
  }, [chunks, query]);

  return (
    <Tabs defaultValue="chunks" className="space-y-4">
      <TabsList>
        <TabsTrigger value="chunks">
          {t.chunkInspector.chunksTab} ({formatNumber(totalChunks, locale)})
        </TabsTrigger>
        <TabsTrigger value="versions">{t.chunkInspector.versionsTab}</TabsTrigger>
      </TabsList>

      <TabsContent value="chunks" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full max-w-sm space-y-1.5">
            <Label htmlFor="chunk-search">{t.chunkInspector.searchPlaceholder}</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="chunk-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.chunkInspector.searchPlaceholder}
                className="pl-8"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.chunkInspector.showingSample
              .replace("{shown}", String(filtered.length))
              .replace("{total}", String(totalChunks))}
          </p>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {t.chunkInspector.filterEmpty}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-3">
            {filtered.map((chunk) => (
              <li key={chunk.id}>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-medium text-foreground">
                          {chunk.id}
                        </span>
                        <Badge variant="outline">
                          {t.chunkInspector.page} {chunk.page}
                        </Badge>
                        <Badge variant="neutral">
                          {chunk.tokens} {t.chunkInspector.tokensLabel}
                        </Badge>
                      </div>

                    </div>
                    <p className="mt-2 text-xs font-medium text-muted-foreground">
                      {chunk.heading}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                      {chunk.text}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
            </ul>
          </div>
        )}
      </TabsContent>

      <TabsContent value="versions">
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {versions.map((version) => (
                <li
                  key={version.version}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-foreground">
                      {version.version}
                    </span>
                    <Badge
                      variant={version.status === "active" ? "success" : "outline"}
                    >
                      {t.chunkInspector.versionStatuses[
                        version.status as keyof typeof t.chunkInspector.versionStatuses
                      ] ?? version.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {formatNumber(version.chunks, locale)} chunk
                    </span>
                    <span>{formatDateTime(version.created_at, locale)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
