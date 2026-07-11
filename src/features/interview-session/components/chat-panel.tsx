/** interview-session - 面试对话主面板 */
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessages } from "./chat-messages";
import type { Message } from "../types";

type ChatPanelProps = {
  message: string;
  messages: Message[];
  sending: boolean;
  evaluating: boolean;
  canConclude: boolean;
  endRef: React.RefObject<HTMLDivElement | null>;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  onEvaluate: () => void;
};

/**
 * chat panel
 * @returns
 */
export function ChatPanel({
  message,
  messages,
  sending,
  evaluating,
  canConclude,
  endRef,
  onMessageChange,
  onSend,
  onEvaluate,
}: ChatPanelProps) {
  return (
    <div className="space-y-5">
      <ChatMessages messages={messages} sending={sending} endRef={endRef} />
      <div className="space-y-3">
        <Textarea
          placeholder="输入你的回答…面试官会针对你的回答继续追问"
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          className="min-h-28 resize-y text-base leading-6"
          rows={4}
          maxLength={5000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">{message.length}/5000</span>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
            {canConclude && (
              <Button
                className="min-h-11"
                variant="outline"
                onClick={onEvaluate}
                disabled={evaluating}
              >
                {evaluating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    AI 评分中…
                  </>
                ) : (
                  "结束对话并评分"
                )}
              </Button>
            )}
            <Button className="min-h-11" onClick={onSend} disabled={sending || !message.trim()}>
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  发送中…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1" />
                  发送
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
