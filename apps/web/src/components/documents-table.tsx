import Link from "next/link";

import type { Document } from "@shelfops/api-client";

import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Dictionary, Locale } from "@/lib/i18n";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";
import { linkIdentityClass } from "@/lib/utils";

function fileKind(mime: string) {
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("wordprocessingml")) return "DOCX";
  if (mime.includes("markdown")) return "MD";
  if (mime.includes("text/plain")) return "TXT";
  return mime;
}

export function DocumentsTable({
  documents,
  locale,
  t,
}: {
  documents: Document[];
  locale: Locale;
  t: Dictionary;
}) {
  return (
    <Table aria-label={t.knowledge.title}>
      <TableHeader>
        <TableRow>
          <TableHead>{t.knowledge.titleLabel}</TableHead>
          <TableHead>{t.knowledge.status}</TableHead>
          <TableHead className="hidden text-right sm:table-cell">
            {t.knowledge.version}
          </TableHead>
          <TableHead className="hidden text-right md:table-cell">
            {t.knowledge.chunks}
          </TableHead>
          <TableHead className="hidden w-24 text-right lg:table-cell">
            {t.knowledge.size}
          </TableHead>
          <TableHead className="text-right">{t.knowledge.updated}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((document) => (
          <TableRow key={document.id}>
            <TableCell className="min-w-52">
              <p className="font-medium text-foreground">
                <Link
                  href={`/knowledge/${document.id}`}
                  className={linkIdentityClass}
                >
                  {document.title}
                </Link>
              </p>
              <p className="mt-0.5">
                <span
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  title={document.mime}
                >
                  {fileKind(document.mime ?? "")}
                </span>
              </p>
              {document.error ? (
                <p className="mt-1 text-xs text-danger-strong">{document.error}</p>
              ) : null}
            </TableCell>
            <TableCell>
              <StatusBadge kind="document" value={document.status} />
            </TableCell>
            <TableCell className="tabular hidden text-right text-muted-foreground sm:table-cell">
              {document.current_version ?? "-"}
            </TableCell>
            <TableCell className="tabular hidden text-right text-muted-foreground md:table-cell">
              {formatNumber(document.chunk_count, locale)}
            </TableCell>
            <TableCell className="tabular hidden whitespace-nowrap text-right text-muted-foreground lg:table-cell">
              {formatBytes(document.size_bytes, locale)}
            </TableCell>
            <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
              {formatDate(document.updated_at ?? document.created_at, locale)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
