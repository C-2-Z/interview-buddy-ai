/** Interview lifecycle 操作组件：渲染暂停、恢复、结束和放弃入口及恢复提示。 */
import { Flag, Loader2, Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InterviewLifecycleAction, InterviewProductStatus } from "../types";

/** 生命周期动作组件属性。 */
export type InterviewLifecycleActionsProps = {
  /** 当前产品状态。 */ status: InterviewProductStatus;
  /** 正在执行的动作。 */ pending: InterviewLifecycleAction | "delete" | null;
  /** 稳定、可恢复的错误文案。 */ error: string | null;
  /** 请求暂停、恢复、提前结束或放弃。 */ onAction: (action: InterviewLifecycleAction) => void;
  /** 请求删除整场记录。 */ onDelete: () => void;
};

/** 在进行中显示暂停/结束，在暂停时显示继续，并将破坏性动作保持为次级入口。 */
export function InterviewLifecycleActions({
  status,
  pending,
  error,
  onAction,
  onDelete,
}: InterviewLifecycleActionsProps) {
  const active = status === "in_progress" || status === "paused";
  return (
    <div className="space-y-2">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {active && (
        <div className="flex flex-wrap gap-2">
          {status === "in_progress" ? (
            <Button variant="outline" onClick={() => onAction("pause")} disabled={pending !== null}>
              {pending === "pause" ? <Loader2 className="animate-spin" /> : <Pause />}暂停
            </Button>
          ) : (
            <Button onClick={() => onAction("resume")} disabled={pending !== null}>
              {pending === "resume" ? <Loader2 className="animate-spin" /> : <Play />}继续面试
            </Button>
          )}
          <Button variant="outline" onClick={() => onAction("finish")} disabled={pending !== null}>
            <Flag />
            提前结束并生成报告
          </Button>
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => onAction("abandon")}
            disabled={pending !== null}
          >
            放弃本场
          </Button>
        </div>
      )}
      {!active && (
        <Button
          variant="outline"
          className="text-destructive"
          onClick={onDelete}
          disabled={pending !== null}
        >
          {pending === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}删除记录
        </Button>
      )}
    </div>
  );
}
