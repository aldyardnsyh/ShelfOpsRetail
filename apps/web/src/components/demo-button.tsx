"use client";

import { useActionState } from "react";

import { startDemoAction, type AuthState } from "@/actions/auth";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

const initialState: AuthState = {};

export function DemoButton({
  label,
  pendingLabel,
  className,
  variant = "primary",
  size = "default",
  next,
}: {
  label?: string;
  pendingLabel?: string;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  next?: string;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(startDemoAction, initialState);

  return (
    <form action={formAction} className="contents">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Button
        type="submit"
        variant={variant}
        size={size}
        disabled={pending}
        className={className}
      >
        {pending ? (pendingLabel ?? t.auth.demoPending) : (label ?? t.landing.demoCta)}
      </Button>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-danger-strong">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
