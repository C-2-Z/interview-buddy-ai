/** interview-session - 面试对话消息列表 */
import { Bot, Loader2, Sparkles, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Message } from "../types";

/**
 * chat messages
 * @returns 
 */
export function ChatMessages({
  messages,
  sending,
  endRef,
}: {
  messages: Message[];
  sending?: boolean;
  endRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="max-h-[min(50dvh,440px)] min-h-64 space-y-4 overflow-y-auto rounded-xl border bg-muted/20 p-3 sm:p-4">
      {messages.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
          开始你的回答，面试官会与你进行多轮对话
        </div>
      ) : (
        messages.map((msg, index) => (
          <div
            key={msg.id || index}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <Avatar className="size-8 flex-shrink-0">
              <AvatarFallback
                className={
                  msg.role === "user"
                    ? "bg-primary/10 text-primary"
                    : "bg-accent text-accent-foreground"
                }
              >
                {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </AvatarFallback>
            </Avatar>
            <div
              className={`max-w-[88%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap leading-6 sm:max-w-[80%] ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))
      )}
      {sending && (
        <div className="flex gap-3">
          <Avatar className="size-8 flex-shrink-0">
            <AvatarFallback className="bg-accent text-accent-foreground">
              <Bot className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
          <div className="bg-muted rounded-lg px-3 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
