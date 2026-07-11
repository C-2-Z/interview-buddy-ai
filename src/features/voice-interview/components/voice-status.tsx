/** voice-interview - 语音状态指示器 */
import {
  AlertTriangle,
  AudioLines,
  Brain,
  CheckCircle2,
  Loader2,
  Mic,
  Pause,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type VoiceStatusValue =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "scored"
  | "error";

const STATUS_CONFIG: Record<
  VoiceStatusValue,
  { label: string; hint: string; className: string; icon: typeof Radio }
> = {
  idle: {
    label: "等待开始",
    hint: "准备好后，开启与 AI 面试官的通话",
    className: "border-voice-border bg-voice-surface text-voice-foreground",
    icon: Radio,
  },
  connecting: {
    label: "正在连接",
    hint: "正在建立安全的语音会话",
    className: "border-voice-accent/25 bg-voice-accent/10 text-voice-accent",
    icon: Loader2,
  },
  listening: {
    label: "正在听你回答",
    hint: "自然表达即可，实时字幕会同步显示",
    className: "border-success/30 bg-success/10 text-success",
    icon: Mic,
  },
  thinking: {
    label: "AI 正在思考",
    hint: "正在理解回答并组织下一步追问",
    className: "border-voice-accent/25 bg-voice-accent/10 text-voice-accent",
    icon: Brain,
  },
  speaking: {
    label: "AI 面试官正在说话",
    hint: "请留意语音和下方同步字幕",
    className: "border-voice-accent/25 bg-voice-accent/10 text-voice-accent",
    icon: AudioLines,
  },
  interrupted: {
    label: "已暂停 AI",
    hint: "你可以直接开始回答或等待下一步",
    className: "border-warning/30 bg-warning/10 text-warning",
    icon: Pause,
  },
  scored: {
    label: "本轮已完成评分",
    hint: "AI 面试官即将继续下一轮",
    className: "border-success/30 bg-success/10 text-success",
    icon: CheckCircle2,
  },
  error: {
    label: "语音服务需要处理",
    hint: "请根据错误提示检查连接或麦克风后重试",
    className: "border-destructive/35 bg-destructive/10 text-destructive",
    icon: AlertTriangle,
  },
};

/**
 * voice status
 *
 * @param status - 
 * @param message - 
 * @returns 
 */
export function VoiceStatus({ status, message }: { status: VoiceStatusValue; message?: string }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={cn(
          "relative flex h-28 w-28 items-center justify-center rounded-full border shadow-2xl transition-colors duration-300 sm:h-32 sm:w-32",
          config.className,
        )}
      >
        {(status === "listening" || status === "speaking") && (
          <>
            <span className="absolute inset-0 animate-ping rounded-full border border-current opacity-20" />
            <span className="absolute -inset-3 rounded-full border border-current/15" />
          </>
        )}
        <Icon className={cn("size-10 sm:size-12", status === "connecting" && "animate-spin")} />
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight text-voice-foreground sm:text-2xl">
        {config.label}
      </h2>
      <p className="mt-1 max-w-lg text-sm leading-6 text-voice-muted">{message || config.hint}</p>
    </div>
  );
}
