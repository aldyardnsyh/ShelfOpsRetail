"use client";

import type {
  ChatMessage,
  Citation,
  Conversation,
  ConversationDetail,
  ToolCall,
} from "@shelfops/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { EmptyState } from "@/components/empty-state";
import {
  History,
  Info,
  MessageSquare,
  Send,
  StopSquare,
  Warning,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { API_BASE_URL } from "@/lib/demo";
import { getDemoReply } from "@/lib/demo-chat";
import { formatDateTimeShort, formatPercent, shortId } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { ChatStreamEvent } from "@/lib/types";
import { cn, linkIdentityClass } from "@/lib/utils";

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function toolVariant(status: ToolCall["status"]) {
  switch (status) {
    case "done":
      return "success" as const;
    case "failed":
    case "rejected":
      return "danger" as const;
    case "awaiting_confirmation":
      return "warning" as const;
    case "running":
      return "accent" as const;
    default:
      return "neutral" as const;
  }
}

function ToolStatus({
  status,
  label,
}: {
  status: ToolCall["status"];
  label: string;
}) {
  return <Badge variant={toolVariant(status)}>{label}</Badge>;
}

function HistoryPanel({
  conversations,
  activeId,
  onNavigate,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onNavigate?: () => void;
}) {
  const { t, locale } = useI18n();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <p className="text-xs font-medium text-muted-foreground">{t.copilot.history}</p>
        <Button asChild variant="link" size="sm" className="h-auto text-xs">
          <Link href="/copilot" onClick={onNavigate}>
            {t.copilot.newConversation}
          </Link>
        </Button>
      </div>
      {conversations.length === 0 ? (
        <div className="p-3">
          <EmptyState
            title={t.copilot.historyEmptyTitle}
            body={t.copilot.historyEmptyBody}
            className="px-3 py-5"
          />
        </div>
      ) : (
        <ul className="flex-1 space-y-0.5 overflow-y-auto p-2 max-h-[60dvh]">
          {conversations.map((conversation) => {
            const active = conversation.id === activeId;
            return (
              <li key={conversation.id}>
                <Link
                  href={`/copilot?c=${conversation.id}`}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-2.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
                  )}
                >
                  <span className="line-clamp-2 text-xs font-medium">
                    {conversation.title}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>
                      {conversation.message_count ?? 0} {t.copilot.messageCount}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {formatDateTimeShort(
                        conversation.updated_at ?? conversation.created_at,
                        locale,
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function CopilotWorkspace({
  conversations,
  initialConversation,
  demoMode,
}: {
  conversations: Conversation[];
  initialConversation: ConversationDetail | null;
  demoMode: boolean;
}) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>(
    initialConversation?.messages ?? [],
  );
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversation?.conversation.id ?? null,
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [liveCitations, setLiveCitations] = useState<Citation[]>([]);
  const [liveTools, setLiveTools] = useState<ToolCall[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCall, setConfirmCall] = useState<ToolCall | null>(null);
  const decideToolRef = useRef(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  // Guard double-submit yang andal meski state `streaming` belum ter-commit
  // saat dipanggil beruntun (mis. double click).
  const streamingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const allCitations = [
    ...messages.flatMap((message) => message.citations ?? []),
    ...liveCitations,
  ].filter(
    (citation, index, list) =>
      list.findIndex((item) => item.chunk_id === citation.chunk_id) === index,
  );
  const allTools = [
    ...messages.flatMap((message) => message.tool_calls ?? []),
    ...liveTools,
  ].filter(
    (tool, index, list) =>
      list.findIndex((item) => item.id === tool.id) === index,
  );

  const hasPanel = allCitations.length > 0 || allTools.length > 0;

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, streaming]);

  const title =
    initialConversation?.conversation.title ?? t.copilot.newChatTitle;

  function toolStatusLabel(status: ToolCall["status"]) {
    switch (status) {
      case "done":
        return t.copilot.toolDone;
      case "failed":
        return t.copilot.toolFailed;
      case "rejected":
        return t.copilot.toolRejected;
      case "running":
        return t.copilot.toolRunning;
      case "awaiting_confirmation":
        return t.copilot.toolAwaiting;
      default:
        return t.copilot.toolPending;
    }
  }

  function commitAssistant(
    content: string,
    citations: Citation[],
    tools: ToolCall[],
    refused = false,
  ) {
    if (!content.trim() && citations.length === 0 && tools.length === 0) return;
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: content.trim() || t.copilot.emptyAnswer,
      citations,
      tool_calls: tools,
      refused,
      replay: demoMode,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, message]);
  }

  async function runDemo(prompt: string, signal: AbortSignal) {
    const reply = getDemoReply(prompt, locale);
    await sleep(320, signal);
    setLiveCitations(reply.citations);
    setLiveTools(reply.toolCalls);
    let accumulated = "";
    const tokens = reply.text.match(/\S+\s*/g) ?? [reply.text];
    try {
      for (const token of tokens) {
        if (signal.aborted) break;
        accumulated += token;
        setStreamingText(accumulated);
        await sleep(18, signal);
      }
    } catch (streamError) {
      if (!signal.aborted) throw streamError;
    }
    if (signal.aborted) {
      if (accumulated.trim()) {
        commitAssistant(accumulated, reply.citations, reply.toolCalls, reply.refused);
      }
      setNotice(t.copilot.stopped);
      return;
    }
    commitAssistant(reply.text, reply.citations, reply.toolCalls, reply.refused);
  }

  async function ensureConversation(prompt: string) {
    if (conversationId) return conversationId;
    const response = await fetch(`${API_BASE_URL}/api/v1/chat/sessions`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: prompt.slice(0, 80) }),
    });
    if (!response.ok) {
      let detail: string | undefined;
      try {
        detail = ((await response.json()) as { detail?: string }).detail;
      } catch {
        detail = undefined;
      }
      throw new Error(detail ?? t.copilot.errorBody);
    }
    const conversation = (await response.json()) as { id: string };
    setConversationId(conversation.id);
    return conversation.id;
  }

  async function runLive(prompt: string, signal: AbortSignal) {
    const id = await ensureConversation(prompt);
    // 1) Kirim pesan. Gateway menjawab 202 dan memproses jawaban di latar
    //    belakang sambil mem-publish event ke hub sesi.
    const posted = await fetch(
      `${API_BASE_URL}/api/v1/chat/sessions/${id}/messages`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ content: prompt }),
        signal,
      },
    );

    if (!posted.ok) {
      let detail: string | undefined;
      try {
        detail = ((await posted.json()) as { detail?: string }).detail;
      } catch {
        detail = undefined;
      }
      throw new Error(detail ?? t.copilot.errorBody);
    }

    const accepted = (await posted.json()) as {
      assistant_message?: { id?: string };
      degradation?: string;
    };
    if (accepted.degradation === "ai_rag_unavailable") {
      throw new Error(
        "Layanan AI belum tersedia pada deployment ini (ai-rag tidak terjangkau).",
      );
    }
    const assistantId = accepted.assistant_message?.id;

    // 2) Berlangganan SSE. Hub mengirim snapshot + event baru; snapshot bisa
    //    memuat giliran sebelumnya, jadi hanya event untuk pesan ini yang
    //    dipakai.
    const response = await fetch(
      `${API_BASE_URL}/api/v1/chat/sessions/${id}/stream`,
      {
        headers: { accept: "text/event-stream" },
        credentials: "include",
        signal,
      },
    );
    if (!response.ok) {
      throw new Error(t.copilot.streamError);
    }
    if (!response.body) {
      throw new Error(t.copilot.streamError);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const citations: Citation[] = [];
    const tools: ToolCall[] = [];
    let accumulated = "";
    let buffer = "";
    let streamFailure: string | null = null;
    let streamDone = false;

    const handleEvent = (raw: string) => {
      const data = raw
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) return;

      let event: ChatStreamEvent;
      try {
        event = JSON.parse(data) as ChatStreamEvent;
      } catch {
        return;
      }

      // Snapshot hub memuat sisa giliran sebelumnya; abaikan pesan lain.
      if (assistantId && event.message_id && event.message_id !== assistantId) {
        return;
      }
      if (event.type === "done") {
        streamDone = true;
        return;
      }

      if (event.type === "token" && event.text) {
        accumulated += event.text;
        setStreamingText(accumulated);
        return;
      }
      if (event.type === "citation" && event.citation) {
        citations.push(event.citation);
        setLiveCitations([...citations]);
        return;
      }
      if (event.type === "tool_start" || event.type === "tool_end") {
        if (event.tool_call) {
          const index = tools.findIndex((tool) => tool.id === event.tool_call?.id);
          if (index >= 0) tools[index] = event.tool_call;
          else tools.push(event.tool_call);
          setLiveTools([...tools]);
        }
        return;
      }
      if (event.type === "confirm_required") {
        if (event.tool_call) {
          const index = tools.findIndex((tool) => tool.id === event.tool_call?.id);
          if (index >= 0) tools[index] = event.tool_call;
          else tools.push(event.tool_call);
          setLiveTools([...tools]);
          setConfirmCall(event.tool_call);
        }
        return;
      }
      if (event.type === "error") {
        streamFailure =
          event.error?.detail ?? event.error?.title ?? t.copilot.streamError;
      }
    };

    try {
      outer: while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        let separator = buffer.indexOf("\n\n");
        while (separator >= 0) {
          const raw = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          handleEvent(raw);
          if (streamDone) break outer;
          separator = buffer.indexOf("\n\n");
        }
      }
      if (!streamDone && buffer.trim()) handleEvent(buffer);
      if (streamDone) await reader.cancel().catch(() => undefined);
    } catch (readError) {
      if (!signal.aborted) throw readError;
      if (accumulated.trim()) {
        commitAssistant(accumulated, citations, tools);
      }
      setNotice(t.copilot.stopped);
      return;
    }

    if (signal.aborted) {
      if (accumulated.trim()) {
        commitAssistant(accumulated, citations, tools);
      }
      setNotice(t.copilot.stopped);
      return;
    }

    if (streamFailure) {
      if (accumulated.trim()) {
        commitAssistant(accumulated, citations, tools);
      }
      throw new Error(streamFailure);
    }

    commitAssistant(accumulated, citations, tools);
  }

  async function send(promptOverride?: string) {
    const prompt = (promptOverride ?? input).trim();
    if (!prompt || streamingRef.current) return;

    setInput("");
    setError(null);
    setNotice(null);
    streamingRef.current = true;
    setStreaming(true);
    setStreamingText("");
    setLiveCitations([]);
    setLiveTools([]);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (demoMode) {
        await runDemo(prompt, controller.signal);
      } else {
        await runLive(prompt, controller.signal);
      }
    } catch (sendError) {
      if (controller.signal.aborted) {
        setNotice(t.copilot.stopped);
      } else {
        // Hapus bubble user yang barusan ditambahkan agar retry tidak
        // menduplikasi pesan yang sama.
        setMessages((current) =>
          current.filter((m) => m.id !== userMessage.id),
        );
        const message =
          sendError instanceof Error ? sendError.message : t.copilot.errorBody;
        setError(message);
        setInput(prompt);
      }
    } finally {
      streamingRef.current = false;
      setStreaming(false);
      setStreamingText("");
      setLiveCitations([]);
      setLiveTools([]);
      abortRef.current = null;
      if (!demoMode) router.refresh();
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function decideTool(decision: "confirm" | "reject") {
    if (!confirmCall || decideToolRef.current) return;
    decideToolRef.current = true;
    if (demoMode) {
      toast({
        title: decision === "confirm" ? t.copilot.toolConfirmed : t.copilot.toolCancelled,
        description: t.common.demoAction,
        variant: "info",
      });
      decideToolRef.current = false;
      setConfirmCall(null);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/tool-calls/${confirmCall.id}/confirm`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      if (!response.ok) throw new Error("confirm");
      toast({
        title:
          decision === "confirm"
            ? t.copilot.toolConfirmed
            : t.copilot.toolCancelled,
        variant: "success",
      });
    } catch {
      toast({ title: t.copilot.confirmError, variant: "error" });
    } finally {
      decideToolRef.current = false;
      setConfirmCall(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <div
      className={cn(
        "grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]",
        hasPanel && "xl:grid-cols-[220px_minmax(0,1fr)_280px]",
      )}
    >
      <Card className="hidden overflow-hidden lg:block">
        <HistoryPanel conversations={conversations} activeId={conversationId} />
      </Card>

      <Card className="flex h-[min(720px,calc(100dvh-13rem))] min-h-[520px] flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border py-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
            </div>
            <p className="text-xs text-muted-foreground">{t.copilot.workspaceContext}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setHistoryOpen(true)}
              aria-label={t.copilot.history}
            >
              <History />
            </Button>
          </div>
        </CardHeader>

        <div
          ref={threadRef}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5"
          aria-live="polite"
          aria-busy={streaming}
        >
          {messages.length === 0 && !streaming ? (
            <div className="flex h-full min-h-72 flex-col items-start justify-center gap-4">
              <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-subtle">
                <MessageSquare className="size-4" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {t.copilot.introTitle}
                </p>
                <p className="max-w-lg text-sm text-muted-foreground">
                  {t.copilot.introBody}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  t.copilot.suggestions.one,
                  t.copilot.suggestions.two,
                  t.copilot.suggestions.three,
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    disabled={streaming}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) => {
            const isUser = message.role === "user";
            if (message.role === "tool") {
              return (
                <div key={message.id} className="rounded-md border border-border bg-surface-subtle p-3">
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {message.content}
                  </p>
                  {message.tool_calls?.length ? (
                    <ul className="mt-2 space-y-1">
                      {message.tool_calls.map((tool) => (
                        <li key={tool.id} className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-foreground">{tool.name}</span>
                          <ToolStatus status={tool.status} label={toolStatusLabel(tool.status)} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            }

            return (
              <div
                key={message.id}
                className={cn("flex", isUser ? "justify-end" : "justify-start")}
              >
                <div className={cn("max-w-[92%] space-y-2", isUser && "items-end")}>
                  <div className={cn("flex items-center gap-2", isUser && "justify-end")}>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {isUser ? t.copilot.user : t.copilot.assistant}
                    </span>
                    {message.created_at ? (
                      <span className="tabular text-[10px] text-muted-foreground">
                        {new Intl.DateTimeFormat(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(message.created_at))}
                      </span>
                    ) : null}
                  </div>
                  {message.refused ? (
                    <div className="rounded-lg border border-warning-soft-border bg-warning-soft p-3">
                      <div className="flex items-start gap-2">
                        <Warning className="mt-0.5 size-4 shrink-0 text-warning-strong" />
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-warning-strong">
                            {t.copilot.refusalTitle}
                          </p>
                          <p className="text-sm leading-6 text-foreground">
                            {message.content}
                          </p>
                          <Link
                            href="/knowledge"
                            className={cn("inline-block text-xs", linkIdentityClass)}
                          >
                            {t.nav.knowledge}
                          </Link>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-6",
                        isUser
                          ? "rounded-br-sm bg-muted text-foreground"
                          : "rounded-bl-sm border border-border bg-background text-foreground",
                      )}
                    >
                      {message.content}
                    </div>
                  )}

                  {message.citations?.length ? (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Info className="size-3" />
                        {t.copilot.sources}
                      </span>
                      {message.citations.map((citation) => (
                        <span key={citation.chunk_id}>
                          [{citation.ordinal}] {citation.document_title}
                        </span>
                      ))}
                      <a
                        href="#copilot-sources"
                        className="hidden rounded text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent xl:inline"
                      >
                        {t.common.view}
                      </a>
                    </div>
                  ) : null}

                  {message.tool_calls?.length ? (
                    <ul className="space-y-1">
                      {message.tool_calls.map((tool) => (
                        <li
                          key={tool.id}
                          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-subtle px-2.5 py-1.5 text-[11px] text-muted-foreground"
                        >
                          <span className="font-mono text-foreground">{tool.name}</span>
                          <ToolStatus status={tool.status} label={toolStatusLabel(tool.status)} />
                          {tool.duration_ms ? <span>{tool.duration_ms} ms</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            );
          })}

          {streaming ? (
            <div className="flex justify-start">
              <div className="max-w-[92%] space-y-2">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t.copilot.assistant}
                </span>
                <div className="rounded-lg rounded-bl-sm border border-border bg-background px-3.5 py-2.5 text-sm leading-6 text-foreground">
                  {streamingText ? (
                    <>
                      <span className="whitespace-pre-wrap">{streamingText}</span>
                      <span
                        className="ml-0.5 inline-block h-3.5 w-0.5 bg-foreground align-middle motion-safe:animate-pulse"
                        aria-hidden="true"
                      />
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      {t.copilot.thinking}
                      <span className="inline-flex items-end gap-0.5" aria-hidden="true">
                        <span className="size-1 rounded-full bg-muted-foreground motion-safe:animate-bounce [animation-delay:-0.24s]" />
                        <span className="size-1 rounded-full bg-muted-foreground motion-safe:animate-bounce [animation-delay:-0.12s]" />
                        <span className="size-1 rounded-full bg-muted-foreground motion-safe:animate-bounce" />
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {notice ? (
            <p className="text-center text-[11px] text-muted-foreground">{notice}</p>
          ) : null}

          {error ? (
            <div
              className="flex items-start gap-2 rounded-lg border border-danger-soft-border bg-danger-soft p-3 text-sm text-danger-strong"
              role="alert"
            >
              <Warning className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">{t.copilot.errorTitle}</p>
                <p>{error}</p>
              </div>
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={submit}
          className="border-t border-border p-3 sm:p-4"
        >
          <Label htmlFor="copilot-input" className="sr-only">
            {t.copilot.inputLabel}
          </Label>
          <div className="flex items-end gap-2">
            <Textarea
              id="copilot-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.copilot.inputPlaceholder}
              maxLength={4000}
              rows={2}
              disabled={streaming}
              className="min-h-[44px] flex-1 resize-none"
            />
            {streaming ? (
              <Button type="button" variant="secondary" onClick={stop}>
                <StopSquare />
                {t.copilot.stop}
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!input.trim()}
                className="disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
              >
                <Send />
                {t.copilot.send}
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t.copilot.composerHint}
          </p>
        </form>
      </Card>

      {hasPanel ? (
      <Card id="copilot-sources" className="hidden h-fit xl:sticky xl:top-20 xl:block">
        <CardHeader className="border-b border-border py-3">
          <h2 className="text-sm font-semibold text-foreground">{t.copilot.sources}</h2>
        </CardHeader>
        <CardContent className="p-3">
          <Tabs defaultValue="sources">
            <TabsList className="w-full">
              <TabsTrigger value="sources" className="flex-1">
                {t.copilot.sources} ({allCitations.length})
              </TabsTrigger>
              <TabsTrigger value="steps" className="flex-1">
                {t.copilot.steps} ({allTools.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="sources" className="mt-3 space-y-2">
              {allCitations.length === 0 ? (
                <EmptyState
                  title={t.copilot.noSourcesTitle}
                  body={t.copilot.noSourcesBody}
                  className="px-3 py-5"
                />
              ) : (
                allCitations.map((citation) => (
                  <div
                    key={citation.chunk_id}
                    className="rounded-md border border-border p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-foreground">
                        [{citation.ordinal}] {citation.document_title}
                      </p>
                      <Badge variant="accent">
                        {formatPercent(citation.score * 100, locale, 0)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {citation.page ? `${t.copilot.page} ${citation.page}` : "-"}
                      {citation.heading_path ? ` · ${citation.heading_path}` : ""}
                    </p>
                    {citation.snippet ? (
                      <p className="mt-1.5 line-clamp-4 text-xs leading-5 text-muted-foreground">
                        {citation.snippet}
                      </p>
                    ) : null}
                    <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                      {t.copilot.chunk}: {shortId(citation.chunk_id, 10)}
                    </p>
                  </div>
                ))
              )}
            </TabsContent>
            <TabsContent value="steps" className="mt-3 space-y-2">
              {allTools.length === 0 ? (
                <EmptyState
                  title={t.copilot.noStepsTitle}
                  body={t.copilot.noStepsBody}
                  className="px-3 py-5"
                />
              ) : (
                allTools.map((tool) => (
                  <div key={tool.id} className="rounded-md border border-border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-xs font-medium text-foreground">
                        {tool.name}
                      </p>
                      <ToolStatus status={tool.status} label={toolStatusLabel(tool.status)} />
                    </div>
                    {tool.result_summary ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tool.result_summary}
                      </p>
                    ) : null}
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {tool.duration_ms ? `${tool.duration_ms} ms` : "-"}
                    </p>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      ) : null}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-sm p-0">
          <DialogTitle className="sr-only">{t.copilot.history}</DialogTitle>
          <HistoryPanel
            conversations={conversations}
            activeId={conversationId}
            onNavigate={() => setHistoryOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmCall)}
        onOpenChange={(open) => {
          // Menutup tanpa keputusan dianggap menolak agar tool call tidak
          // menggantung selamanya di awaiting_confirmation.
          if (!open && confirmCall && !decideToolRef.current) {
            void decideTool("reject");
          } else {
            setConfirmCall(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.copilot.confirmTitle}</DialogTitle>
            <DialogDescription>{t.copilot.confirmBody}</DialogDescription>
          </DialogHeader>
          {confirmCall ? (
            <div className="space-y-2">
              <p className="font-mono text-xs font-medium text-foreground">
                {confirmCall.name}
              </p>
              <pre className="max-h-48 overflow-auto rounded-md border border-border bg-surface-subtle p-3 font-mono text-[11px] text-muted-foreground">
                {JSON.stringify(confirmCall.args ?? {}, null, 2)}
              </pre>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void decideTool("reject")}
            >
              {t.copilot.reject}
            </Button>
            <Button type="button" onClick={() => void decideTool("confirm")}>
              {t.copilot.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

