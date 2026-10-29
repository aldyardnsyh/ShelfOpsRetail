import { cn } from "@/lib/utils";

/**
 * Mock percakapan copilot: pertanyaan pemilik, jawaban, dan sitasi.
 * Statis sesuai data demo; tidak ada kontrol mati karena tidak ada kontrol.
 */
export function MockCopilot({
  question,
  answer,
  sourceLabel,
  citation,
  confidence,
  className,
}: {
  question: string;
  answer: string;
  sourceLabel: string;
  citation: string;
  confidence: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "landing-lift overflow-hidden rounded-2xl border border-border bg-background shadow-[0_1px_2px_rgba(24,24,27,0.06),0_12px_32px_-14px_rgba(24,24,27,0.14)]",
        className,
      )}
    >
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-xl rounded-br-sm bg-surface-subtle px-3.5 py-2.5 text-sm leading-6 text-foreground">
            {question}
          </p>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[92%] rounded-xl rounded-bl-sm border border-border px-3.5 py-2.5">
            <p className="text-sm leading-6 text-foreground">{answer}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {sourceLabel}
              </span>
              <span className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                {citation}
              </span>
              <span className="landing-num ml-auto text-[11px] text-muted-foreground">
                {confidence}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
