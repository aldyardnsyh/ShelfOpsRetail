"use client";

import type { MeResponse, Workspace } from "@shelfops/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import {
  updateWorkspaceAction,
  type WorkspaceActionState,
} from "@/actions/workspace";
import { Avatar } from "@/components/avatar";
import { Warning, ChevronRight } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { isAdminRole } from "@/lib/types";

const initialState: WorkspaceActionState = { status: "idle" };

export function SettingsForm({
  me,
  workspace,
  demoMode,
}: {
  me: MeResponse;
  workspace: Workspace;
  demoMode: boolean;
}) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateWorkspaceAction,
    initialState,
  );
  const [workspaceName, setWorkspaceName] = useState(workspace.name);
  const [workspaceLocale, setWorkspaceLocale] = useState<"id" | "en">(
    workspace.locale === "en" ? "en" : "id",
  );
  const canManage = isAdminRole(me.role);

  useEffect(() => {
    if (state.status === "success") {
      toast({ title: t.settings.saved, variant: "success" });
      router.refresh();
    }
    if (state.status === "demo") {
      toast({
        title: t.settings.demoSaved,
        variant: "info",
      });
    }
    if (state.status === "error") {
      toast({
        title: t.settings.saveError,
        description: state.detail,
        variant: "error",
      });
    }
  }, [state, router, t, toast]);

  const modules = [
    { href: "/inventory", label: t.nav.inventory },
    { href: "/pricing", label: t.nav.pricing },
    { href: "/purchasing", label: t.nav.purchasing },
    { href: "/reports", label: t.nav.reports },
    { href: "/integrations", label: t.nav.integrations },
  ];

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card className="lg:col-start-1 lg:row-start-1">
        <CardHeader className="border-b border-border">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {t.settings.profileTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{t.settings.profileBody}</p>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center gap-3">
            <Avatar name={me.user.name} className="size-10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {me.user.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {me.user.email}
              </p>
            </div>
            <Badge variant="outline" className="ml-auto">
              {t.roles[me.role] ?? me.role}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <CardHeader className="border-b border-border">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {t.settings.workspaceTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t.settings.workspaceBody}
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          {!canManage ? (
            <div
              className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-surface-subtle p-3 text-sm text-muted-foreground"
              role="status"
            >
              <Warning className="mt-0.5 size-4 shrink-0" />
              <span>{t.settings.adminOnly}</span>
            </div>
          ) : null}

          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="workspace-name">{t.settings.workspaceName}</Label>
              <Input
                id="workspace-name"
                name="name"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                disabled={!canManage || pending}
                minLength={2}
                maxLength={80}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="workspace-locale">{t.settings.workspaceLocale}</Label>
              <select
                id="workspace-locale"
                name="locale"
                value={workspaceLocale}
                onChange={(event) =>
                  setWorkspaceLocale(event.target.value === "en" ? "en" : "id")
                }
                disabled={!canManage || pending}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 sm:h-9"
              >
                <option value="id">{t.common.indonesian}</option>
                <option value="en">{t.common.english}</option>
              </select>
            </div>

            <Button
              type="submit"
              className="w-full sm:w-auto"
              aria-busy={pending}
              disabled={!canManage || pending}
            >
              {pending ? `${t.common.saving}...` : t.settings.saveWorkspace}
            </Button>
          </form>

          {workspace.is_demo ? (
            <div
              className="mt-5 rounded-lg border border-border bg-surface-subtle p-3"
              role="status"
            >
              <p className="text-xs font-medium text-foreground">
                {t.settings.retentionTitle}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {workspace.retention_note ?? t.common.demoBannerBody}
              </p>
              {workspace.demo_expires_at ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.settings.demoExpires}:{" "}
                  {formatDate(workspace.demo_expires_at, locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              ) : null}
            </div>
          ) : null}

        </CardContent>
      </Card>

      {canManage ? (
        <Card className="lg:col-start-1 lg:row-start-2">
          <CardHeader className="border-b border-border">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {t.settings.memberTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{t.settings.memberBody}</p>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 pt-5">
            <p className="text-sm text-muted-foreground">{t.settings.membersCta}</p>
            <Button asChild variant="secondary" size="sm" className="shrink-0">
              <Link href="/users">
                {t.settings.manageMembers}
                <ChevronRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="lg:col-span-2">
        <CardHeader className="border-b border-border">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {t.settings.modulesTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{t.settings.modulesBody}</p>
        </CardHeader>
        <CardContent className="pt-5">
          <ul className="grid gap-3 sm:grid-cols-2">
            {modules.map((module) => (
              <li key={module.href}>
                <Link
                  href={module.href}
                  className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {module.label}
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  >
                    '
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}