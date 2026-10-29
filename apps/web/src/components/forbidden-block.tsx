import Link from "next/link";

import { Warning } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";

/**
 * Blok 403 bersama untuk halaman yang dibatasi peran.
 * Menggantikan salinan inline di /users, /audit, dan halaman baru.
 */
export async function ForbiddenBlock({
  need = "admin",
}: {
  need?: "admin" | "lab";
}) {
  const { t } = await getI18n();
  const body =
    need === "lab" ? t.states.forbiddenLabBody : t.states.forbiddenBody;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-4 py-10">
      <span className="flex size-10 items-center justify-center rounded-lg border border-warning-soft-border bg-warning-soft text-warning-strong">
        <Warning className="size-5" />
      </span>
      <div className="space-y-1.5">
        <p className="font-mono text-xs text-muted-foreground">403</p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t.states.forbiddenTitle}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">{body}</p>
        <p className="max-w-md text-xs text-muted-foreground">
          {t.states.forbiddenHint}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <Link href="/dashboard">{t.states.backDashboard}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/docs">{t.states.docsLink}</Link>
        </Button>
      </div>
    </div>
  );
}
