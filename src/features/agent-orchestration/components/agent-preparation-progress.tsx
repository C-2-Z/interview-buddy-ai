/** Agent 准备进度：在首题生成前展示真实活动事件和受控边界。 */
import { Bot, CheckCircle2, Circle, CircleDashed, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentActivity, AgentStrategyView } from "../types";
import { getAgentActivityDetail } from "../activity-copy";

/** 渲染准备步骤状态；动画会尊重系统的 reduced-motion 设置。 */
function StepIcon({ status }: { status: AgentActivity["status"] | "pending" }) {
  if (status === "completed") return <CheckCircle2 className="size-5 text-emerald-600" />;
  if (status === "running") {
    return <CircleDashed className="size-5 animate-spin text-primary motion-reduce:animate-none" />;
  }
  if (status === "failed") return <Circle className="size-5 text-destructive" />;
  return <Circle className="size-5 text-muted-foreground/40" />;
}

/** 首题尚未出现时，用活动流解释 Agent 正在执行的可审计步骤。 */
export function AgentPreparationProgress({
  position,
  activities,
  strategy,
}: {
  /** 当前目标岗位。 */
  position: string;
  /** 按发生顺序排列的持久化活动。 */
  activities: AgentActivity[];
  /** 已提交后才展示的策略摘要。 */
  strategy: AgentStrategyView | null;
}) {
  const visibleActivities = activities.slice(-8);
  const hasRunningActivity = visibleActivities.some((activity) => activity.status === "running");
  return (
    <Card className="mx-auto w-full max-w-2xl border-primary/20 bg-primary/[0.025]">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="size-5 text-primary" />
            Agent 正在准备这场面试
          </CardTitle>
          <Badge variant="secondary" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
            实时更新
          </Badge>
        </div>
        <p className="max-w-prose text-sm leading-6 text-muted-foreground">
          正在围绕“{position}”整理资料、制定策略并选择首题。联网检索或模型繁忙时会更久，工具失败会降级继续。
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <ol className="space-y-4" aria-label="Agent 准备行动" aria-live="polite">
          <li className="flex gap-3">
            <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
            <div>
              <p className="text-sm font-medium">已冻结面试规则</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                题量、角色顺序、评分权重和结束条件不会被模型修改
              </p>
            </div>
          </li>
          {visibleActivities.length === 0 && (
            <li className="flex gap-3" role="status">
              <StepIcon status="running" />
              <div>
                <p className="text-sm font-medium">正在启动岗位上下文整理</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  活动记录写入后会在这里自动显示
                </p>
              </div>
            </li>
          )}
          {visibleActivities.map((activity) => (
            <li key={activity.id} className="flex gap-3" role={activity.status === "running" ? "status" : undefined}>
              <StepIcon status={activity.status} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{activity.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {getAgentActivityDetail(activity)}
                </p>
              </div>
            </li>
          ))}
          <li className="flex gap-3">
            <StepIcon status={strategy && !hasRunningActivity ? "running" : "pending"} />
            <div>
              <p className="text-sm font-medium">生成并校验首道题目</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                确认题目符合当前角色、能力维度且没有重复
              </p>
            </div>
          </li>
        </ol>
        <div className="flex gap-2 rounded-xl border bg-background/70 p-3 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          页面只展示行动、来源数量和结果，不展示模型原始推理、Prompt 或工具原文。
        </div>
      </CardContent>
    </Card>
  );
}
