/** voice-interview - 实时语音转写文本 */
import { Bot, Captions, Mic2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { VoiceMessage } from "../types";

export function LiveTranscript({
  messages,
  partial,
  stageMessage,
}: {
  messages: VoiceMessage[];
  partial: string;
  stageMessage?: string;
}) {
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const latestAssistant = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );
  const latestCandidate = useMemo(
    () => [...messages].reverse().find((message) => message.role === "user"),
    [messages],
  );

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    transcriptEndRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [messages, partial]);

  return (
    <section className="rounded-2xl border border-voice-border bg-voice-surface p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 text-sm font-medium text-voice-foreground">
          <Captions className="h-4 w-4 text-voice-accent" />
          实时字幕
        </div>
        <span className="max-w-[65%] truncate text-xs text-voice-muted">
          {stageMessage || "等待语音输入"}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-h-32 rounded-xl border border-voice-accent/20 bg-voice-accent/[0.07] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-voice-accent">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-voice-accent/15">
              <Bot className="h-4 w-4" />
            </span>
            AI 面试官
          </div>
          <p className="text-sm leading-6 text-voice-foreground sm:text-base">
            {latestAssistant?.content || "连接后，AI 面试官会主动开始本轮提问。"}
          </p>
          {latestAssistant?.interrupted && (
            <span className="mt-2 inline-block text-xs text-warning">语音已打断</span>
          )}
        </div>

        <div className="min-h-32 rounded-xl border border-success/20 bg-success/[0.07] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-success">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success/15">
              <Mic2 className="h-4 w-4" />
            </span>
            你的回答
            {partial && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                识别中
              </span>
            )}
          </div>
          <p className="text-sm leading-6 text-voice-foreground sm:text-base">
            {partial || latestCandidate?.content || "开始回答后，你的实时语音字幕会显示在这里。"}
          </p>
        </div>
      </div>

      {messages.length > 2 && (
        <details className="group mt-3 rounded-xl border border-voice-border bg-voice-background/35">
          <summary className="cursor-pointer list-none px-4 py-3 text-xs text-voice-muted transition-colors hover:text-voice-foreground">
            查看本场完整字幕（{messages.length} 条）
          </summary>
          <div className="max-h-56 space-y-3 overflow-y-auto border-t border-voice-border p-3">
            {messages.map((message) => (
              <div
                key={message.id ?? `${message.role}-${message.created_at}`}
                className={message.role === "user" ? "text-right" : "text-left"}
              >
                <div
                  className={
                    message.role === "user"
                      ? "inline-block max-w-[88%] rounded-xl bg-success/10 px-3 py-2 text-left text-sm text-voice-foreground"
                      : "inline-block max-w-[88%] rounded-xl bg-voice-accent/10 px-3 py-2 text-sm text-voice-foreground"
                  }
                >
                  <div className="mb-1 text-xs text-voice-muted">
                    {message.role === "user" ? "候选人" : "AI 面试官"}
                  </div>
                  {message.content}
                  {message.interrupted && <span className="ml-2 text-xs opacity-70">已打断</span>}
                </div>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </details>
      )}
    </section>
  );
}
