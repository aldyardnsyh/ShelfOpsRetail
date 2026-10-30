"use client";

import { useActionState, useState } from "react";

import { applySetupAction, type SetupActionResult } from "@/actions/setup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Labels {
  stepStatus: string;
  stepWorkspace: string;
  stepAI: string;
  stepAdmin: string;
  stepDone: string;
  statusTitle: string;
  statusBody: string;
  workspaceTitle: string;
  workspaceBody: string;
  workspaceName: string;
  aiTitle: string;
  aiBody: string;
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  adminTitle: string;
  adminBody: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  doneTitle: string;
  doneBody: string;
  submit: string;
  saving: string;
  back: string;
  next: string;
  hasAdmin: string;
  noAdmin: string;
  setupDone: string;
  setupPending: string;
  providerOk: string;
  providerMock: string;
  demoNote: string;
}

interface Status {
  workspace_name: string;
  is_demo: boolean;
  has_admin: boolean;
  setup_done: boolean;
  providers: Record<string, string>;
  provider_ok: boolean;
}

const initial: SetupActionResult = { ok: false, demo: false };

export function SetupWizard({
  demoMode,
  initialStatus,
  workspaceName,
  labels,
}: {
  demoMode: boolean;
  initialStatus: Status | null;
  workspaceName: string;
  labels: Labels;
}) {
  const [step, setStep] = useState(0);
  const [state, action, pending] = useActionState(applySetupAction, initial);
  const steps = [
    labels.stepStatus,
    labels.stepWorkspace,
    labels.stepAI,
    labels.stepAdmin,
    labels.stepDone,
  ];

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2" aria-label="Setup">
        {steps.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={step === i ? "step" : undefined}
              className={
                step === i
                  ? "rounded-full bg-accent px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
              }
            >
              {`${i + 1}. ${label}`}
            </button>
          </li>
        ))}
      </ol>

      {demoMode ? (
        <p className="rounded-lg border border-border bg-surface-subtle p-3 text-sm text-muted-foreground" role="status">
          {labels.demoNote}
        </p>
      ) : null}

      {step === 0 ? (
        <Card>
          <CardHeader className="border-b border-border">
            <h2 className="text-base font-semibold">{labels.statusTitle}</h2>
            <p className="text-sm text-muted-foreground">{labels.statusBody}</p>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {initialStatus ? (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Workspace</dt>
                  <dd className="font-medium">{initialStatus.workspace_name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Admin</dt>
                  <dd>
                    <Badge variant={initialStatus.has_admin ? "success" : "neutral"}>
                      {initialStatus.has_admin ? labels.hasAdmin : labels.noAdmin}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Setup</dt>
                  <dd>
                    <Badge variant={initialStatus.setup_done ? "success" : "neutral"}>
                      {initialStatus.setup_done ? labels.setupDone : labels.setupPending}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">LLM</dt>
                  <dd>
                    <Badge variant={initialStatus.provider_ok ? "success" : "neutral"}>
                      {`${initialStatus.providers.llm ?? "-"} · ${initialStatus.provider_ok ? labels.providerOk : labels.providerMock}`}
                    </Badge>
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                {demoMode ? labels.demoNote : "…"}
              </p>
            )}
            <Button type="button" onClick={() => setStep(1)}>
              {labels.next}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <form action={action} className="space-y-5">
        {step === 1 ? (
          <Card>
            <CardHeader className="border-b border-border">
              <h2 className="text-base font-semibold">{labels.workspaceTitle}</h2>
              <p className="text-sm text-muted-foreground">{labels.workspaceBody}</p>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="space-y-1.5">
                <Label htmlFor="setup-workspace">{labels.workspaceName}</Label>
                <Input
                  id="setup-workspace"
                  name="workspace_name"
                  defaultValue={workspaceName}
                  minLength={2}
                  maxLength={80}
                  placeholder={workspaceName}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setStep(0)}>
                  {labels.back}
                </Button>
                <Button type="button" onClick={() => setStep(2)}>
                  {labels.next}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card>
            <CardHeader className="border-b border-border">
              <h2 className="text-base font-semibold">{labels.aiTitle}</h2>
              <p className="text-sm text-muted-foreground">{labels.aiBody}</p>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="space-y-1.5">
                <Label htmlFor="setup-llm-provider">{labels.llmProvider}</Label>
                <select
                  id="setup-llm-provider"
                  name="llm_provider"
                  defaultValue=""
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">(ikut env server)</option>
                  <option value="openai-compatible">openai-compatible</option>
                  <option value="replay">replay (tiruan)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-llm-url">{labels.llmBaseUrl}</Label>
                <Input id="setup-llm-url" name="llm_base_url" placeholder="https://api.example.com/v1" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-llm-key">{labels.llmApiKey}</Label>
                <Input id="setup-llm-key" name="llm_api_key" type="password" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-llm-model">{labels.llmModel}</Label>
                <Input id="setup-llm-model" name="llm_model" placeholder="model-id" />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                  {labels.back}
                </Button>
                <Button type="button" onClick={() => setStep(3)}>
                  {labels.next}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card>
            <CardHeader className="border-b border-border">
              <h2 className="text-base font-semibold">{labels.adminTitle}</h2>
              <p className="text-sm text-muted-foreground">{labels.adminBody}</p>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="space-y-1.5">
                <Label htmlFor="setup-admin-email">{labels.adminEmail}</Label>
                <Input id="setup-admin-email" name="admin_email" type="email" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-admin-password">{labels.adminPassword}</Label>
                <Input id="setup-admin-password" name="admin_password" type="password" minLength={8} autoComplete="new-password" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-admin-name">{labels.adminName}</Label>
                <Input id="setup-admin-name" name="admin_name" autoComplete="off" />
              </div>
              {state.detail ? (
                <p className="text-sm text-destructive">{state.detail}</p>
              ) : null}
              {state.ok && state.message ? (
                <p className="text-sm text-emerald-600">
                  {state.demo ? "Simulasi demo: " : ""}
                  {state.message}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                  {labels.back}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? `${labels.saving}…` : labels.submit}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 4 ? (
          <Card>
            <CardHeader className="border-b border-border">
              <h2 className="text-base font-semibold">{labels.doneTitle}</h2>
              <p className="text-sm text-muted-foreground">{labels.doneBody}</p>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {state.ok ? (
                <Badge variant="success">{state.message ?? labels.setupDone}</Badge>
              ) : (
                <Badge variant="neutral">{labels.setupPending}</Badge>
              )}
              <div>
                <Button type="button" variant="secondary" onClick={() => setStep(0)}>
                  {labels.back}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </form>
    </div>
  );
}
