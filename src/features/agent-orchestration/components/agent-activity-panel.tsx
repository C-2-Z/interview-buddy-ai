/** Agent 行动面板：展示策略重点和行动依据，不暴露内部推理。 */
import {
  CheckCircle2,
  CircleDashed,
  Database,
  Lightbulb,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAgentActivityDetail } from "../activity-copy";
import type { AgentActivity, AgentStrategyView } from "../types";

/** 将活动状态映射为可辨识且无技术术语的图标。 */
function StatusIcon({ status }: { status: AgentActivity["status"] }) {
  if (status === "completed") return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (status === "failed") return <XCircle className="size-4 text-destructive" />;
  if (status === "running")
    return <CircleDashed className="size-4 animate-spin text-primary motion-reduce:animate-none" />;
  return <CircleDashed className="size-4 text-muted-foreground" />;
}

/** 渲染当前训练重点以及最近的规划、资料检索和策略修订。 */
export function AgentActivityPanel({
  strategy,
  activities,
}: {
  strategy: AgentStrategyView | null;
  activities: AgentActivity[];
}) {
  if (!strategy && activities.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="size-4" />本场训练策略
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {strategy && (
          <div className="space-y-2">
            <p className="text-sm leading-6">{strategy.objective}</p>
            <div className="flex flex-wrap gap-1.5">
              {strategy.focusDimensions.map((item) => (
                <Badge key={item} variant="secondary">{item}</Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>策略第 {strategy.revision} 版</span>
              {strategy.brainApplied && (
                <span className="flex items-center gap-1"><Database className="size-3" />已使用所选 Brain</span>
              )}
              {strategy.memoryApplied && (
                <span className="flex items-center gap-1"><RefreshCw className="size-3" />已参考训练趋势</span>
              )}
            </div>
          </div>
        )}
        <ol className="space-y-3 border-t pt-3" aria-label="Agent 行动时间线">
          {activities.slice(0, 8).map((activity) => (
            <li key={activity.id} className="flex gap-2 text-sm">
              <StatusIcon status={activity.status} />
              <div className="min-w-0 flex-1">
                <p>{activity.label}</p>
                <p className="text-xs text-muted-foreground">
                  {getAgentActivityDetail(activity)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
