import type { Metadata } from "next";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { TasksBoard, type TaskRow } from "@/components/tasks-board";
import { getI18n } from "@/lib/i18n/server";
import { getTasks } from "@/lib/data";

export const metadata: Metadata = {
  title: "Tugas",
};

type TasksPayload = {
  items: TaskRow[];
  next_cursor?: string | null;
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ alert?: string }>;
}) {
  const { alert: highlightAlertId } = await searchParams;
  const { t } = await getI18n();
  const res = await getTasks();

  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t.tasks.title}
          description={t.tasks.subtitle}
          meta={<p className="text-xs text-muted-foreground">{t.tasks.meta}</p>}
        />
        <ErrorState error={res.error} />
      </div>
    );
  }
  const data = res.data as unknown as TasksPayload;
  const nowIso = new Date().toISOString();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.tasks.title}
        description={t.tasks.subtitle}
        meta={<p className="text-xs text-muted-foreground">{t.tasks.meta}</p>}
      />
      <TasksBoard
        tasks={(data.items ?? []) as unknown as TaskRow[]}
        nowIso={nowIso}
        highlightAlertId={highlightAlertId}
        labels={{
          task: t.tasks.title,
          store: t.inventory.store,
          priority: t.tasks.priorityLabel,
          priorityLabel: t.tasks.priorityLabel,
          statusLabel: t.tasks.statusLabel,
          due: t.inventory.when,
          status: t.common.status,
          actions: t.common.actions,
          search: t.common.search,
          searchPlaceholder: t.tasks.searchPlaceholder,
          filterAll: t.tasks.filterAll,
          filterOpen: t.tasks.filterOpen,
          filterProgress: t.tasks.filterProgress,
          filterDone: t.tasks.filterDone,
          assignee: t.tasks.assignee,
          start: t.tasks.start,
          finish: t.tasks.finish,
          reopen: t.tasks.reopen,
          fromAlert: t.tasks.fromAlert,
          overdue: t.tasks.overdue,
          emptyTitle: t.tasks.emptyTitle,
          emptyFilteredTitle: t.tasks.emptyFilteredTitle,
          emptyFilteredBody: t.tasks.emptyFilteredBody,
          checklist: t.tasks.detailTitle,
          detailTitle: t.tasks.detailTitle,
          priorities: t.tasks.priorities as Record<string, string>,
          statuses: t.tasks.statuses as Record<string, string>,
          statusToastPrefix: t.tasks.statusToastPrefix,
          demoToast: t.tasks.demoToast,
          updateError: t.tasks.updateError,
        }}
      />
    </div>
  );
}