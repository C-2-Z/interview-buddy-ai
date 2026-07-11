/** voice-interview - 语音调试日志 */
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Info,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type VoiceDebugLogLevel = "info" | "success" | "warning" | "error";

export type VoiceDebugLogEntry = {
  id: number;
  at: string;
  level: VoiceDebugLogLevel;
  label: string;
  detail?: string;
  turnId?: string;
};

const LEVEL_LABELS: Record<VoiceDebugLogLevel, string> = {
  info: "信息",
  success: "成功",
  warning: "警告",
  error: "错误",
};

const LEVEL_STYLES: Record<VoiceDebugLogLevel, string> = {
  info: "text-voice-muted",
  success: "text-success",
  warning: "text-warning",
  error: "text-destructive",
};

const LEVEL_ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertCircle,
  error: AlertCircle,
} satisfies Record<VoiceDebugLogLevel, typeof Info>;

export function VoiceDebugLog({
  entries,
  onClear,
  connected,
  microphoneActive,
}: {
  entries: VoiceDebugLogEntry[];
  onClear: () => void;
  connected: boolean;
  microphoneActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasError = entries.some((entry) => entry.level === "error");
  const errorCount = entries.filter((entry) => entry.level === "error").length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-voice-border bg-voice-surface text-voice-foreground">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm"
            >
              <Activity className="h-4 w-4 text-voice-muted" />
              <span className="font-medium">连接与诊断</span>
              <span className="hidden items-center gap-3 text-xs text-voice-muted sm:flex">
                <span className="inline-flex items-center gap-1">
                  <Circle
                    className={cn(
                      "h-2 w-2 fill-current",
                      connected ? "text-success" : "text-voice-muted/50",
                    )}
                  />
                  {connected ? "服务已连接" : "服务未连接"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Circle
                    className={cn(
                      "h-2 w-2 fill-current",
                      microphoneActive ? "text-success" : "text-voice-muted/50",
                    )}
                  />
                  {microphoneActive ? "麦克风采集中" : "麦克风待机"}
                </span>
              </span>
              {hasError && (
                <Badge variant="destructive" className="ml-auto shrink-0">
                  {errorCount} 个错误
                </Badge>
              )}
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-voice-muted transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 text-voice-muted hover:bg-voice-surface-strong hover:text-voice-foreground"
            onClick={onClear}
            disabled={entries.length === 0}
            aria-label="清空诊断日志"
            title="清空诊断日志"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <CollapsibleContent>
          <div className="grid grid-cols-2 gap-2 border-t border-voice-border p-3 text-xs sm:hidden">
            <span className="inline-flex items-center gap-1.5">
              <Circle
                className={cn(
                  "h-2 w-2 fill-current",
                  connected ? "text-success" : "text-voice-muted/50",
                )}
              />
              {connected ? "服务已连接" : "服务未连接"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Circle
                className={cn(
                  "h-2 w-2 fill-current",
                  microphoneActive ? "text-success" : "text-voice-muted/50",
                )}
              />
              {microphoneActive ? "麦克风采集中" : "麦克风待机"}
            </span>
          </div>
          <ScrollArea className="h-44 border-t border-voice-border">
            <div className="space-y-2 p-3">
              {entries.length === 0 ? (
                <div className="text-sm text-voice-muted">暂无诊断日志</div>
              ) : (
                entries.map((entry) => {
                  const Icon = LEVEL_ICONS[entry.level];
                  return (
                    <div key={entry.id} className="flex gap-2 text-sm">
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${LEVEL_STYLES[entry.level]}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-voice-foreground">{entry.label}</span>
                          <span className="text-xs text-voice-muted">{entry.at}</span>
                          <span className={`text-xs ${LEVEL_STYLES[entry.level]}`}>
                            {LEVEL_LABELS[entry.level]}
                          </span>
                        </div>
                        {entry.detail && (
                          <div className="mt-0.5 break-words text-xs text-voice-muted">
                            {entry.detail}
                          </div>
                        )}
                        {entry.turnId && (
                          <div className="mt-0.5 break-all font-mono text-xs text-voice-muted/70">
                            {entry.turnId}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
