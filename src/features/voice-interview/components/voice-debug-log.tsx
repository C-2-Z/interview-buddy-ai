import { Activity, AlertCircle, CheckCircle2, Info, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  info: "text-muted-foreground",
  success: "text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
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
}: {
  entries: VoiceDebugLogEntry[];
  onClear: () => void;
}) {
  const hasError = entries.some((entry) => entry.level === "error");

  return (
    <div className="rounded-md border bg-background">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">语音诊断</span>
          {hasError && (
            <Badge variant="destructive" className="shrink-0">
              最新错误
            </Badge>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClear}
          disabled={entries.length === 0}
          title="清空诊断日志"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="h-44">
        <div className="space-y-2 p-3">
          {entries.length === 0 ? (
            <div className="text-sm text-muted-foreground">暂无诊断日志</div>
          ) : (
            entries.map((entry) => {
              const Icon = LEVEL_ICONS[entry.level];
              return (
                <div key={entry.id} className="flex gap-2 text-sm">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${LEVEL_STYLES[entry.level]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{entry.label}</span>
                      <span className="text-xs text-muted-foreground">{entry.at}</span>
                      <span className={`text-xs ${LEVEL_STYLES[entry.level]}`}>
                        {LEVEL_LABELS[entry.level]}
                      </span>
                    </div>
                    {entry.detail && (
                      <div className="mt-0.5 break-words text-xs text-muted-foreground">
                        {entry.detail}
                      </div>
                    )}
                    {entry.turnId && (
                      <div className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
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
    </div>
  );
}
