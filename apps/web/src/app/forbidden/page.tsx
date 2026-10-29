"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Warning } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";

export default function ForbiddenPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const message = [
    t.states.requestAccessBody,
    "",
    `Halaman: ${pathname ?? "/"}`,
  ].join("\n");

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      toast({ title: t.states.requestAccessCopied, variant: "success" });
      setOpen(false);
    } catch {
      toast({ title: t.states.requestAccessFailed, variant: "error" });
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-5 px-4 py-10">
      <Logo />
      <span className="flex size-10 items-center justify-center rounded-lg border border-warning-soft-border bg-warning-soft text-warning-strong">
        <Warning className="size-5" />
      </span>
      <div className="space-y-2">
        <p className="font-mono text-xs text-muted-foreground">403</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t.states.forbiddenTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{t.states.forbiddenBody}</p>
        <p className="text-xs text-muted-foreground">{t.states.forbiddenHint}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setOpen(true)}>
          {t.states.requestAccess}
        </Button>
        <Button asChild variant="secondary">
          <Link href="/dashboard">{t.states.backDashboard}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/docs">{t.states.docsLink}</Link>
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.states.requestAccessTitle}</DialogTitle>
            <DialogDescription>{t.states.requestAccessBody}</DialogDescription>
          </DialogHeader>
          <Textarea readOnly value={message} rows={6} aria-label={t.states.requestAccessTitle} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t.common.close}
            </Button>
            <Button type="button" onClick={copyMessage}>
              {t.states.requestAccessCopy}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

