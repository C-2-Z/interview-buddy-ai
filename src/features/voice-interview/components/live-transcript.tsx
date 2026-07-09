import { ScrollArea } from "@/components/ui/scroll-area";
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
  return (
    <div className="space-y-2">
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">实时字幕</span>
          <span className="text-xs text-muted-foreground">
            {stageMessage || "等待语音输入"}
          </span>
        </div>
        {partial && (
          <div className="mt-2 rounded-md bg-background px-3 py-2 text-sm text-muted-foreground">
            候选人：{partial}
          </div>
        )}
      </div>

      <ScrollArea className="h-64 rounded-md border p-3">
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === "user" ? "text-right" : "text-left"}
            >
              <div
                className={
                  message.role === "user"
                    ? "inline-block max-w-[82%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "inline-block max-w-[82%] rounded-md bg-muted px-3 py-2 text-sm"
                }
              >
                <div className="mb-1 text-[11px] opacity-70">
                  {message.role === "user" ? "候选人" : "AI 面试官"}
                </div>
                {message.content}
                {message.interrupted && (
                  <span className="ml-2 text-xs opacity-70">已打断</span>
                )}
              </div>
            </div>
          ))}
          {partial && (
            <div className="text-right">
              <div className="inline-block max-w-[82%] rounded-md border px-3 py-2 text-sm text-muted-foreground">
                <div className="mb-1 text-[11px] opacity-70">候选人实时识别</div>
                {partial}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
