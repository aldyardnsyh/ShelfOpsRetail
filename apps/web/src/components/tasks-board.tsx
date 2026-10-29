"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { updateTaskStatusAction } from "@/actions/tasks";
import { Bell, CheckCircle, ChevronRight, Play, Refresh } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export interface TaskRow {
  id: string;
  title: string;
  detail: string;
  alert_id: string;
  alert_type: string;
  severity: "high" | "medium" | "low";
  store_id: string;
  store_name: string;
  assignee: string;
  status: "open" | "in_progress" | "done";
  due_at: string;
  created_at: string;
  checklist: ({ text: string; done?: boolean } | string)[];
}

const SEVERITY_VARIANT = {
  high: "danger",
  medium: "warning",
  low: "neutral",
} as const;

const STATUS_VARIANT = {
  open: "warning",
  in_progress: "accent",
  done: "success",
} as const;

export function TasksBoard({
  tasks: initialTasks,
  nowIso,
  highlightAlertId,
  labels,
}: {
  tasks: TaskRow[];
  nowIso: string;
  highlightAlertId?: string;
  labels: {
    task: string;
    store: string;
    priority: string;
    priorityLabel: string;
    statusLabel: string;
    due: string;
    status: string;
    actions: string;
    search: string;
    searchPlaceholder: string;
    filterAll: string;
    filterOpen: string;
    filterProgress: string;
    filterDone: string;
    assignee: string;
    start: string;
    finish: string;
    reopen: string;
    fromAlert: string;
    overdue: string;
    emptyTitle: string;
    emptyFilteredTitle: string;
    emptyFilteredBody: string;
    checklist: string;
    detailTitle: string;
    priorities: Record<string, string>;
    statuses: Record<string, string>;
    statusToastPrefix: string;
    demoToast: string;
    updateError: string;
  };
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [tasks, setTasks] = useState(initialTasks);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "in_progress" | "done">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<string | undefined>(highlightAlertId);

  useEffect(() => {
    if (!highlightAlertId) return;
    setActiveHighlight(highlightAlertId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-alert-id="${highlightAlertId}"]`);
      el?.scrollIntoView({ block: "center" });
      timer = setTimeout(() => setActiveHighlight(undefined), 3000);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [highlightAlertId]);

  const now = new Date(nowIso).getTime();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesStatus = filter === "all" || task.status === filter;
      const matchesQuery =
        !needle ||
        task.title.toLowerCase().includes(needle) ||
        task.store_name.toLowerCase().includes(needle) ||
        task.id.toLowerCase().includes(needle);
      return matchesStatus && matchesQuery;
    });
  }, [tasks, query, filter]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      open: tasks.filter((x) => x.status === "open").length,
      in_progress: tasks.filter((x) => x.status === "in_progress").length,
      done: tasks.filter((x) => x.status === "done").length,
    }),
    [tasks],
  );

  const overdueCount = tasks.filter(
    (x) => x.status !== "done" && new Date(x.due_at).getTime() < now,
  ).length;

  const hasFilters = Boolean(query || filter !== "all");

  async function setStatus(id: string, status: TaskRow["status"]) {
    if (status !== "open" && status !== "in_progress" && status !== "done") return;
    const previous = tasks;
    const task = tasks.find((item) => item.id === id);
    setTasks((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    const result = await updateTaskStatusAction(id, status);
    if (!result.ok) {
      setTasks(previous);
      toast({
        title: labels.updateError,
        description:
          result.detail === "role_not_allowed"
            ? "Peran Anda tidak boleh mengubah tugas."
            : result.detail,
        variant: "error",
      });
      return;
    }
    toast({
      title: labels.statusToastPrefix,
      description: result.demo ? labels.demoToast : task?.title,
      variant: "success",
    });
  }

  const filterBtn = (value: typeof filter, label: string, count: number) => (
    <button
      key={value}
      type="button"
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className={cn(
        "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        filter === value
          ? "border-accent bg-accent-soft text-accent-strong"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label} ({count})
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full space-y-1.5 sm:max-w-xs">
          <Label htmlFor="task-search">{labels.search}</Label>
          <Input
            id="task-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.searchPlaceholder}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {filterBtn("all", labels.filterAll, counts.all)}
          {filterBtn("open", labels.filterOpen, counts.open)}
          {filterBtn("in_progress", labels.filterProgress, counts.in_progress)}
          {filterBtn("done", labels.filterDone, counts.done)}
        </div>
      </div>

      {overdueCount > 0 ? (
        <p className="text-xs text-danger-strong">
          {labels.overdue}: {overdueCount}
        </p>
      ) : null}

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{labels.task}</TableHead>
              <TableHead className="hidden w-48 md:table-cell">{labels.store}</TableHead>
              <TableHead className="w-24">{labels.priorityLabel}</TableHead>
              <TableHead className="hidden w-32 whitespace-nowrap sm:table-cell">
                {labels.due}
              </TableHead>
              <TableHead className="w-28">{labels.statusLabel}</TableHead>
              <TableHead className="w-40 text-right sticky right-0 z-10 bg-surface-subtle border-l border-border">
                {labels.actions}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((task) => {
              const overdue = task.status !== "done" && new Date(task.due_at).getTime() < now;
              const open = expanded === task.id;
              const highlighted = task.alert_id === activeHighlight;
              return (
                <Fragment key={task.id}>
                  <TableRow
                    data-alert-id={task.alert_id}
                    data-highlight={highlighted ? "true" : undefined}
                    className={cn("group hover:bg-muted/60", highlighted && "bg-accent-soft/40")}
                  >
                  <TableCell className="align-top">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : task.id)}
                      aria-expanded={open}
                      className="group flex items-start gap-2 text-left"
                    >
                      <ChevronRight
                        className={cn(
                          "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                          open && "rotate-90",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block w-full max-w-[22rem] truncate text-sm font-medium text-foreground" title={task.title}>
                          {task.title}
                        </span>
                        <span className="tabular block text-[11px] text-muted-foreground">
                          {task.id} · {task.assignee}
                        </span>
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="hidden w-44 align-top md:table-cell">
                    <span className="block truncate text-sm text-muted-foreground" title={task.store_name}>
                      {task.store_name}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={SEVERITY_VARIANT[task.severity]}>
                      {labels.priorities[task.severity]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap align-top sm:table-cell">
                    <span
                      className={cn(
                        "tabular text-xs",
                        overdue ? "font-medium text-danger-strong" : "text-muted-foreground",
                      )}
                    >
                      {task.due_at.slice(0, 16).replace("T", " ")}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={STATUS_VARIANT[task.status]}>
                      {labels.statuses[task.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right align-top sticky right-0 bg-background group-hover:bg-muted/60 border-l border-border">
                    <div className="flex items-center justify-end gap-1">
                      {task.status === "open" ? (
                        <Tooltip label={labels.start}>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={() => setStatus(task.id, "in_progress")}
                            aria-label={labels.start}
                          >
                            <Play className="text-success" />
                          </Button>
                        </Tooltip>
                      ) : task.status === "in_progress" ? (
                        <Tooltip label={labels.finish}>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={() => setStatus(task.id, "done")}
                            aria-label={labels.finish}
                          >
                            <CheckCircle className="text-success" />
                          </Button>
                        </Tooltip>
                      ) : (
                        <Tooltip label={labels.reopen}>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={() => setStatus(task.id, "open")}
                            aria-label={labels.reopen}
                          >
                            <Refresh className="text-warning-strong" />
                          </Button>
                        </Tooltip>
                      )}
                      <Tooltip label={labels.fromAlert}>
                        <Button asChild variant="secondary" size="icon">
                          <Link
                            href={`/alerts?alert=${task.alert_id}`}
                            aria-label={`${labels.fromAlert}: ${task.alert_id}`}
                          >
                            <Bell className="text-warning-strong" />
                          </Link>
                        </Button>
                      </Tooltip>
                    </div>
                  </TableCell>
                  </TableRow>
                  {open ? (
                    <TableRow className="bg-muted/50">
                    <TableCell colSpan={5} className="border-l-2 border-l-accent align-top">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {labels.detailTitle}
                      </p>
                      <p className="mt-1 text-sm text-foreground">{task.detail}</p>
                      <ul className="mt-3 space-y-1.5">
                        {task.checklist.map((raw, i) => {
                          const step =
                            typeof raw === "string" ? { text: raw, done: false } : raw;
                          return (
                            <li
                              key={`${task.id}-step-${i}`}
                              className="flex items-start gap-2 text-xs text-muted-foreground"
                            >
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold",
                                  step.done
                                    ? "border-success bg-success-soft text-success-strong"
                                    : "border-border bg-background text-muted-foreground",
                                )}
                              >
                                {step.done ? "✓" : i + 1}
                              </span>
                              <span className={cn(step.done && "line-through opacity-70")}>
                                {step.text}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        {task.alert_id ? (
                          <>
                            {labels.fromAlert}:{" "}
                            <Button asChild variant="secondary" size="sm">
                              <Link href={`/alerts?alert=${task.alert_id}`}>
                                {task.alert_id}
                              </Link>
                            </Button>
                          </>
                        ) : (
                          labels.task
                        )}
                      </p>
                    </TableCell>
                    <TableCell aria-hidden="true" className="sticky right-0 bg-muted/50 border-l border-border" />
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
            <p className="text-sm font-medium text-foreground">
              {hasFilters ? labels.emptyFilteredTitle : labels.emptyTitle}
            </p>
            {hasFilters ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {labels.emptyFilteredBody}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  {t.common.resetFilter}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}