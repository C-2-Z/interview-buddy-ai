/** interview-hub：带稳定 readiness 区域的单个模式入口面板。 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, CircleAlert, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentReadinessResponse } from "@/features/agent-readiness/types";
import type { InterviewHomeMode } from "../types";

/** 模式面板属性。 */
export type InterviewModePanelProps = Readonly<{
  /** 面板静态文案。 */
  mode: InterviewHomeMode;
  /** 后端模式级 readiness。 */
  readiness: AgentReadinessResponse | undefined;
  /** 是否正在刷新。 */
  checking: boolean;
  /** readiness 请求是否失败。 */
  error: boolean;
  /** 原地重试检查。 */
  onRetry(): void;
}>;

/** 根据聚合状态返回不依赖颜色的状态文案。 */
function readinessLabel(
  readiness: AgentReadinessResponse | undefined,
  checking: boolean,
  error: boolean,
) {
  if (checking && !readiness) return "正在检查可用性";
  if (error && !readiness) return "暂时无法完成检查";
  if (readiness?.status === "blocked") return "完成必要设置后可用";
  if (readiness?.status === "degraded") return "可用，部分能力已降级";
  return readiness ? "当前可以开始" : "等待检查";
}

// 面板保留固定高度状态区，异步检查不会推动主操作发生布局跳动。
export function InterviewModePanel({
  mode,
  readiness,
  checking,
  error,
  onRetry,
}: InterviewModePanelProps) {
  const Icon = mode.icon;
  const blocked = !readiness || readiness.status === "blocked" || error;
  const StatusIcon =
    checking && !readiness
      ? Loader2
      : error || readiness?.status === "blocked"
        ? CircleAlert
        : readiness?.status === "degraded"
          ? TriangleAlert
          : Check;
  const primaryIssue = readiness?.blockers[0] ?? readiness?.warnings[0];

  return (
    <article className="group flex min-w-0 flex-col rounded-3xl border bg-card p-5 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-lg sm:p-7 lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex size-13 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-6" aria-hidden="true" />
        </div>
        <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
          {mode.eyebrow}
        </span>
      </div>
      <h2 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">{mode.title}</h2>
      <p className="mt-3 text-base leading-7 text-muted-foreground">{mode.description}</p>
      <ul className="mt-6 flex-1 space-y-3">
        {mode.benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-3 text-sm leading-6">
            <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check className="size-3" aria-hidden="true" />
            </span>
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      <div
        className="mt-7 min-h-20 rounded-2xl bg-muted/55 p-3.5"
        aria-live="polite"
        aria-busy={checking}
      >
        <div className="flex items-start gap-2.5">
          <StatusIcon
            className={`mt-0.5 size-4 shrink-0 ${checking && !readiness ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">{readinessLabel(readiness, checking, error)}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {primaryIssue?.message ??
                (mode.id === "voice"
                  ? "将检查模型、语音识别和语音播报服务。"
                  : "将检查模型与可恢复会话服务。")}
            </p>
          </div>
        </div>
      </div>

      {blocked ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button className="min-h-12" disabled aria-disabled="true">
            暂不可开始
          </Button>
          {primaryIssue?.recoveryAction === "open_settings" ? (
            <Button variant="outline" className="min-h-12" asChild>
              <Link to="/settings">前往设置</Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              className="min-h-12"
              type="button"
              onClick={onRetry}
              disabled={checking}
            >
              <RefreshCw className={checking ? "animate-spin" : ""} />
              重新检查
            </Button>
          )}
        </div>
      ) : (
        <Button className="mt-4 min-h-12 w-full justify-between" asChild>
          <Link to={mode.to}>
            {mode.action}
            <ArrowRight
              className="size-4 transition-transform duration-200 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        </Button>
      )}
    </article>
  );
}
