/** Q&A 模块：右侧聊天对话区域 */

import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QaMessageBubble } from "./qa-message-bubble";
import { Badge } from "@/components/ui/badge";
import type { QaMessage, KnowledgeDocument } from "../types";

/** QA 聊天面板属性 */
interface QaChatPanelProps {
  messages: QaMessage[] | undefined;
  isLoading: boolean;
  isAsking: boolean;
  documentIds: string[];
  documents: KnowledgeDocument[];
  onSubmit: (question: string) => void;
  streamingAnswer?: string;
}

/** QA 聊天面板 */
export function QaChatPanel({
  messages,
  isLoading,
  isAsking,
  documentIds,
  documents,
  onSubmit,
  streamingAnswer = "",
}: QaChatPanelProps) {
  const [question, setQuestion] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const linkedDocs = documents.filter((d) => documentIds.includes(d.id));

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  /** 发送消息 */
  function handleSend() {
    const trimmed = question.trim();
    if (!trimmed || isAsking) return;
    onSubmit(trimmed);
    setQuestion("");
  }

  return (
    <div className="flex h-full flex-col">
      {/* 关联文档标签 */}
      {linkedDocs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b px-4 py-2">
          <span className="text-[11px] text-muted-foreground">关联:</span>
          {linkedDocs.map((doc) => (
            <Badge key={doc.id} variant="secondary" className="text-[11px]">
              {doc.title}
            </Badge>
          ))}
        </div>
      )}

      {/* 消息列表 */}
      <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">输入问题开始问答</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <QaMessageBubble key={msg.id} message={msg} />
            ))}
            {/* 流式回答进行中：有文本就显示实时增量，否则显示加载动画 */}
            {isAsking && (
              <div className="flex justify-start">
                {streamingAnswer ? (
                  <div className="rounded-2xl bg-muted px-4 py-2.5">
                    <p className="whitespace-pre-wrap text-sm">{streamingAnswer}</p>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-muted px-4 py-2.5">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* 输入框 */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入你的问题..."
            className="min-h-10 resize-none"
            rows={1}
          />
          <Button
            size="icon"
            className="shrink-0 self-end"
            onClick={handleSend}
            disabled={!question.trim() || isAsking}
          >
            {isAsking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
