"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type AuthState } from "@/actions/auth";
import { DemoButton } from "@/components/demo-button";
import { Warning } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/client";

const initialState: AuthState = {};

export function LoginForm({
  demoMode,
  sessionExpired,
  next,
}: {
  demoMode: boolean;
  sessionExpired: boolean;
  next?: string;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {demoMode ? t.auth.demoHeadline : t.auth.signInTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{t.auth.signInBody}</p>
        {demoMode ? (
          <p className="text-sm text-muted-foreground">{t.auth.demoModeBody}</p>
        ) : null}
      </div>

      {sessionExpired ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-border bg-surface-subtle p-3 text-sm text-muted-foreground"
          role="status"
        >
          <Warning className="mt-0.5 size-4 shrink-0" />
          <span>{t.auth.sessionExpired}</span>
        </div>
      ) : null}

      {demoMode ? null : (
      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next ?? "/dashboard"} />
        <div className="space-y-1.5">
          <Label htmlFor="email">
            {t.auth.emailLabel}
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t.auth.emailPlaceholder}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">
            {t.auth.passwordLabel}
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder={t.auth.passwordPlaceholder}
            required
            minLength={8}
          />
        </div>

        {state.error ? (
          <div
            className="flex items-start gap-2 rounded-lg border border-danger-soft-border bg-danger-soft p-3 text-sm text-danger-strong"
            role="alert"
            aria-live="polite"
          >
            <Warning className="mt-0.5 size-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          disabled={pending}
        >
          {pending ? `${t.auth.signInPending}...` : t.auth.signInCta}
        </Button>
      </form>
      )}

      {demoMode ? null : (
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
          <span className="text-[11px] text-muted-foreground">{t.auth.demoTitle}</span>
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {demoMode ? t.auth.demoBody : t.auth.credentialsHint}
        </p>
        <DemoButton
          label={t.auth.demoCta}
          pendingLabel={t.auth.demoPending}
          variant={demoMode ? "primary" : "secondary"}
          className="w-full"
          next={next}
        />
      </div>
    </div>
  );
}
