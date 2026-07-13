/** Q&A 模块：单条消息气泡（含引用标注） */

import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { QaMessage } from "../types";

/** 消息气泡属性 */
interface QaMessageBubbleProps {
  message: QaMessage;
}

/** 单条 QA 消息气泡 */
export function QaMessageBubble({ message }: QaMessageBubbleProps) {
  const isUser = message.role === "user";
  const hasCitations = message.citedChunks && message.citedChunks.length > 0;

  // 提取引用脚注标记
  const content = hasCitations
    ? insertCitationMarkers(message.content, message.citedChunks.length)
    : message.content;

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] space-y-1 rounded-2xl px-4 py-2.5",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>

        {/* 引用标注 */}
        {hasCitations && !isUser && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
            {message.citedChunks.map((chunk, i) => (
              <HoverCard key={chunk.chunkId}>
                <HoverCardTrigger asChild>
                  <button className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground hover:bg-secondary/80">
                    <span className="font-mono">[{i + 1}]</span>
                    <span className="truncate max-w-[120px]">{chunk.content.slice(0, 30)}</span>
                  </button>
                </HoverCardTrigger>
                <HoverCardContent side="top" className="w-80 text-sm">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      相似度: {(chunk.similarity * 100).toFixed(0)}%
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {chunk.content}
                    </p>
                  </div>
                </HoverCardContent>
              </HoverCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 在 AI 回答末尾追加引用角标（简单实现：统一在末尾加 [1][2]...） */
function insertCitationMarkers(content: string, count: number): string {
  if (count === 0) return content;
  const markers = Array.from({ length: count }, (_, i) => `[${i + 1}]`).join(" ");
  return `${content}\n\n${markers}`;
}
