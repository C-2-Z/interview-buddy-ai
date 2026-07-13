/** immersive-voice-interview：语音错误的明确恢复面板。 */
import { CircleAlert, LogOut, MessageSquareText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VoiceRecoveryIssue } from "../types";

/** 恢复面板属性。 */
export type VoiceRecoveryAlertProps = Readonly<{
  /** 当前安全错误。 */ issue: VoiceRecoveryIssue;
  /** 原地重连。 */ onRetry(): void;
  /** 使用同一 Agent 会话降级为文字输入。 */ onSwitchToText(): void;
  /** 退出到模式首页。 */ onExit(): void;
}>;

// 错误面板使用 alert 并提供三个可执行动作，恢复含义不只依赖颜色。
export function VoiceRecoveryAlert({
  issue,
  onRetry,
  onSwitchToText,
  onExit,
}: VoiceRecoveryAlertProps) {
  return (
    <section
      className="absolute inset-x-4 bottom-28 z-30 mx-auto max-w-xl rounded-2xl border border-voice-border bg-voice-surface-strong p-5 text-voice-foreground shadow-2xl"
      role="alert"
    >
      <div className="flex gap-3">
        <CircleAlert className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="font-semibold">语音连接需要恢复</h2>
          <p className="mt-1 text-sm leading-6 text-voice-muted">{issue.message}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Button
          variant="secondary"
          className="min-h-11"
          onClick={onRetry}
          disabled={!issue.retryable}
        >
          <RefreshCw />
          重新连接
        </Button>
        <Button variant="secondary" className="min-h-11" onClick={onSwitchToText}>
          <MessageSquareText />
          切换文字
        </Button>
        <Button
          variant="ghost"
          className="min-h-11 text-voice-muted hover:text-voice-foreground"
          onClick={onExit}
        >
          <LogOut />
          退出面试
        </Button>
      </div>
    </section>
  );
}
