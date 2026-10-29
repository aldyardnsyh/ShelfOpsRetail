"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  Camera,
  Copy,
  FileText,
  Layers,
  Plug,
  Plus,
  Send,
  Tag,
  Users,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export interface Connector {
  id: string;
  name: string;
  kind: string;
  status: string;
  store_scope: string;
  last_sync: string | null;
  records: number;
  latency_ms: number;
  note: string;
}

export interface SyncRun {
  id: string;
  connector: string;
  kind: string;
  started_at: string;
  duration_s: number;
  status: string;
  records: number;
  message: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  masked: string;
  scope: string;
  created_at: string;
  last_used: string;
  status: string;
}

export interface WebhookEvent {
  id: string;
  event: string;
  endpoint: string;
  status: string;
  attempts: number;
  at: string;
}

const STATUS_VARIANT: Record<string, "success" | "accent" | "warning" | "danger" | "neutral"> = {
  connected: "success",
  syncing: "accent",
  ready: "accent",
  not_connected: "neutral",
  success: "success",
  partial: "warning",
  failed: "danger",
  delivered: "success",
  retrying: "warning",
  active: "success",
  expired: "neutral",
};

const KIND_ICON: Record<string, typeof Plug> = {
  pos: Tag,
  erp: Layers,
  camera: Camera,
  file: FileText,
  webhook: Send,
  auth: Users,
};

export function IntegrationsView({
  connectors: initialConnectors,
  runs,
  apiKeys,
  webhookEvents,
  labels,
}: {
  connectors: Connector[];
  runs: SyncRun[];
  apiKeys: ApiKey[];
  webhookEvents: WebhookEvent[];
  labels: {
    tabConnectors: string;
    tabRuns: string;
    tabApi: string;
    connector: string;
    kind: string;
    scope: string;
    status: string;
    lastSync: string;
    records: string;
    latency: string;
    test: string;
    testing: string;
    testSuccess: string;
    statuses: Record<string, string>;
    runId: string;
    runConnector: string;
    started: string;
    duration: string;
    runStatus: string;
    runRecords: string;
    message: string;
    runStatuses: Record<string, string>;
    apiTitle: string;
    apiBody: string;
    keyName: string;
    keyScope: string;
    keyCreated: string;
    keyLastUsed: string;
    keyStatus: string;
    copyKey: string;
    keyCopied: string;
    keyCopyFailed: string;
    keyStatuses: Record<string, string>;
    webhookTitle: string;
    webhookBody: string;
    event: string;
    endpoint: string;
    attempts: string;
    deliveredAt: string;
    eventStatuses: Record<string, string>;
    emptyTitle: string;
    emptyBody: string;
    addConnector: string;
    addTitle: string;
    addBody: string;
    addKind: string;
    addName: string;
    addSubmit: string;
    addSuccess: string;
  };
}) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [connectors, setConnectors] = useState(initialConnectors);
  const [tab, setTab] = useState<"connectors" | "runs" | "api">("connectors");
  const [query, setQuery] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [newKind, setNewKind] = useState("pos");
  const [newName, setNewName] = useState("");
  const testTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (testTimerRef.current !== null) {
        window.clearTimeout(testTimerRef.current);
      }
    };
  }, []);

  const needle = query.trim().toLowerCase();
  const filteredConnectors = useMemo(
    () =>
      connectors.filter(
        (item) =>
          !needle ||
          item.name.toLowerCase().includes(needle) ||
          item.kind.toLowerCase().includes(needle) ||
          item.store_scope.toLowerCase().includes(needle),
      ),
    [connectors, needle],
  );

  const kindLabel: Record<string, string> = {
    pos: "POS",
    erp: "ERP",
    camera: "CCTV",
    file: "CSV",
    webhook: "Webhook",
    auth: "SSO",
  };

  function testConnector(id: string) {
    setTesting(id);
    if (testTimerRef.current !== null) {
      window.clearTimeout(testTimerRef.current);
    }
    testTimerRef.current = window.setTimeout(() => {
      testTimerRef.current = null;
      setTesting(null);
      toast({ title: labels.testSuccess, variant: "success" });
    }, 700);
  }

  function addConnector() {
    const name = newName.trim();
    if (!name) return;
    setConnectors((current) => [
      ...current,
      {
        id: `INT-${Date.now()}`,
        name,
        kind: newKind,
        status: "not_connected",
        store_scope: "Belum diatur",
        last_sync: null,
        records: 0,
        latency_ms: 0,
        note: labels.addBody,
      },
    ]);
    setNewName("");
    setOpen(false);
    setTab("connectors");
    toast({ title: labels.addSuccess, variant: "success" });
  }

  async function copyKey(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: labels.keyCopied, variant: "success" });
    } catch {
      toast({ title: labels.keyCopyFailed, variant: "error" });
    }
  }

  const tabClass = (active: boolean) =>
    cn(
      "border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      active
        ? "border-accent text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full space-y-1.5 sm:max-w-xs">
          <Label htmlFor="integration-search">{t.common.search}</Label>
          <Input
            id="integration-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.connector}
          />
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <Plus />
          {labels.addConnector}
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b border-border" role="tablist">
        <button
          type="button"
          role="tab"
          id="tab-connectors"
          aria-selected={tab === "connectors"}
          onClick={() => setTab("connectors")}
          className={tabClass(tab === "connectors")}
        >
          {labels.tabConnectors} ({formatNumber(connectors.length, locale)})
        </button>
        <button
          type="button"
          role="tab"
          id="tab-runs"
          aria-selected={tab === "runs"}
          onClick={() => setTab("runs")}
          className={tabClass(tab === "runs")}
        >
          {labels.tabRuns} ({formatNumber(runs.length, locale)})
        </button>
        <button
          type="button"
          role="tab"
          id="tab-api"
          aria-selected={tab === "api"}
          onClick={() => setTab("api")}
          className={tabClass(tab === "api")}
        >
          {labels.tabApi}
        </button>
      </div>

      {tab === "connectors" ? (
        filteredConnectors.length === 0 ? (
          <div
            role="tabpanel"
            id="panel-connectors"
            aria-labelledby="tab-connectors"
            tabIndex={0}
            className="rounded-lg border border-border p-8 text-center"
          >
            <p className="text-sm font-medium text-foreground">{labels.emptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{labels.emptyBody}</p>
          </div>
        ) : (
          <div
            role="tabpanel"
            id="panel-connectors"
            aria-labelledby="tab-connectors"
            tabIndex={0}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {filteredConnectors.map((connector) => {
              const Icon = KIND_ICON[connector.kind] ?? Plug;
              return (
                <div key={connector.id} className="flex flex-col rounded-lg border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-subtle">
                        <Icon className="size-4 text-foreground" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{connector.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {kindLabel[connector.kind] ?? connector.kind} · {connector.store_scope}
                        </p>
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT[connector.status] ?? "neutral"}>
                      {labels.statuses[connector.status] ?? connector.status}
                    </Badge>
                  </div>
                  <p className="mt-3 min-h-10 text-xs leading-5 text-muted-foreground">{connector.note}</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-[11px]">
                    <div>
                      <dt className="text-muted-foreground">{labels.records}</dt>
                      <dd className="tabular mt-0.5 text-sm font-medium text-foreground">
                        {formatNumber(connector.records, locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{labels.latency}</dt>
                      <dd className="tabular mt-0.5 text-sm font-medium text-foreground">
                        {connector.latency_ms ? `${formatNumber(connector.latency_ms, locale)} ms` : "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{labels.lastSync}</dt>
                      <dd className="tabular mt-0.5 text-xs text-foreground">
                        {connector.last_sync ? formatDateTime(connector.last_sync, locale) : "-"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={testing === connector.id}
                      onClick={() => testConnector(connector.id)}
                    >
                      {testing === connector.id ? labels.testing : labels.test}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : null}

      {tab === "runs" ? (
        <div
          role="tabpanel"
          id="panel-runs"
          aria-labelledby="tab-runs"
          tabIndex={0}
          className="rounded-lg border border-border"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.runId}</TableHead>
                <TableHead>{labels.runConnector}</TableHead>
                <TableHead className="hidden md:table-cell">{labels.started}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{labels.duration}</TableHead>
                <TableHead className="hidden text-right lg:table-cell">{labels.runRecords}</TableHead>
                <TableHead className="text-right">{labels.runStatus}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id} className="hover:bg-muted/60">
                  <TableCell>
                    <span className="tabular block text-sm font-medium text-foreground">{run.id}</span>
                    <span className="block max-w-[18rem] truncate text-[11px] text-muted-foreground" title={run.message}>
                      {run.message}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{run.connector}</TableCell>
                  <TableCell className="tabular hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                    {formatDateTime(run.started_at, locale)}
                  </TableCell>
                  <TableCell className="tabular hidden text-right text-sm sm:table-cell">
                    {run.duration_s.toFixed(1)} s
                  </TableCell>
                  <TableCell className="tabular hidden text-right text-sm lg:table-cell">
                    {formatNumber(run.records, locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={STATUS_VARIANT[run.status] ?? "neutral"}>
                      {labels.runStatuses[run.status] ?? run.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {tab === "api" ? (
        <div
          role="tabpanel"
          id="panel-api"
          aria-labelledby="tab-api"
          tabIndex={0}
          className="space-y-6"
        >
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">{labels.apiTitle}</h2>
            <p className="text-xs text-muted-foreground">{labels.apiBody}</p>
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{labels.keyName}</TableHead>
                    <TableHead className="hidden md:table-cell">{labels.keyScope}</TableHead>
                    <TableHead className="hidden lg:table-cell">{labels.keyCreated}</TableHead>
                    <TableHead className="hidden lg:table-cell">{labels.keyLastUsed}</TableHead>
                    <TableHead className="text-right">{labels.keyStatus}</TableHead>
                    <TableHead className="text-right sticky right-0 z-10 bg-surface-subtle border-l border-border">
                      {t.common.actions}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((key) => (
                    <TableRow key={key.id} className="group hover:bg-muted/60">
                      <TableCell>
                        <span className="block text-sm font-medium text-foreground">{key.name}</span>
                        <span className="tabular block text-[11px] text-muted-foreground">{key.masked}</span>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {key.scope}
                      </TableCell>
                      <TableCell className="tabular hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                        {key.created_at.slice(0, 10)}
                      </TableCell>
                      <TableCell className="tabular hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                        {key.last_used.slice(0, 16).replace("T", " ")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={STATUS_VARIANT[key.status] ?? "neutral"}>
                          {labels.keyStatuses[key.status] ?? key.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right sticky right-0 bg-background group-hover:bg-muted/60 border-l border-border">
                        <Tooltip label={labels.copyKey}>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            aria-label={labels.copyKey}
                            onClick={() => copyKey(key.masked)}
                          >
                            <Copy />
                          </Button>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">{labels.webhookTitle}</h2>
            <p className="text-xs text-muted-foreground">{labels.webhookBody}</p>
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{labels.event}</TableHead>
                    <TableHead className="hidden md:table-cell">{labels.endpoint}</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">{labels.attempts}</TableHead>
                    <TableHead className="hidden lg:table-cell">{labels.deliveredAt}</TableHead>
                    <TableHead className="text-right">{labels.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhookEvents.map((event) => (
                    <TableRow key={event.id} className="hover:bg-muted/60">
                      <TableCell>
                        <span className="block text-sm font-medium text-foreground">{event.event}</span>
                        <span className="tabular block text-[11px] text-muted-foreground">{event.id}</span>
                      </TableCell>
                      <TableCell className="hidden max-w-[18rem] truncate text-xs text-muted-foreground md:table-cell" title={event.endpoint}>
                        {event.endpoint}
                      </TableCell>
                      <TableCell className="tabular hidden text-right text-sm sm:table-cell">
                        {formatNumber(event.attempts, locale)}
                      </TableCell>
                      <TableCell className="tabular hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                        {event.at.slice(5, 16).replace("T", " ")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={STATUS_VARIANT[event.status] ?? "neutral"}>
                          {labels.eventStatuses[event.status] ?? event.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.addTitle}</DialogTitle>
            <DialogDescription>{labels.addBody}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="connector-kind">{labels.addKind}</Label>
              <select
                id="connector-kind"
                value={newKind}
                onChange={(event) => setNewKind(event.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
              >
                <option value="pos">POS</option>
                <option value="erp">ERP</option>
                <option value="camera">CCTV</option>
                <option value="file">CSV</option>
                <option value="webhook">Webhook</option>
                <option value="auth">SSO</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="connector-name">{labels.addName}</Label>
              <Input
                id="connector-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="POS cabang Bandung"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="button" onClick={addConnector} disabled={!newName.trim()}>
              {labels.addSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
