/** Q&A 模块：左侧问答会话列表 */

import { Plus, MessageSquare, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { QaSession } from "../types";

/** QA 侧栏属性 */
interface QaSidebarProps {
  sessions: QaSession[] | undefined;
  isLoading: boolean;
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
}

/** QA 会话侧栏 */
export function QaSidebar({
  sessions,
  isLoading,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: QaSidebarProps) {
  return (
    <div className="flex h-full flex-col border-r">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">问答记录</h3>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => onNewSession()}>
          <Plus className="size-4" />
        </Button>
      </div>

      {/* 会话列表 */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">暂无问答记录</div>
        ) : (
          <div className="space-y-0.5 p-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  "group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  activeSessionId === session.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
                onClick={() => onSelectSession(session.id)}
              >
                <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{session.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {session.messageCount}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                >
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
