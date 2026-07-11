/** interview-session - 面试进度指示 */
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { SessionDetail } from "../types";

/**
 * session progress
 * @returns
 */
export function SessionProgress({
  session,
  progress,
  answeredCount,
  total,
}: {
  session: SessionDetail;
  progress: number;
  answeredCount: number;
  total: number;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge>{session.position}</Badge>
        <Badge variant="outline">{session.difficulty}</Badge>
        <span className="ml-auto text-sm font-medium">文本面试</span>
      </div>
      <div className="flex items-center gap-3">
        <Progress value={progress} className="h-1.5 flex-1" />
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {answeredCount}/{total}
        </span>
      </div>
    </div>
  );
}
