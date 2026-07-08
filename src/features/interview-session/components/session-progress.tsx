import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { SessionDetail } from "../types";

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
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Badge>{session.position}</Badge>
        <Badge variant="outline">{session.difficulty}</Badge>
      </div>
      <div className="flex items-center gap-3">
        <Progress value={progress} className="flex-1" />
        <span className="text-sm text-muted-foreground">
          {answeredCount}/{total}
        </span>
      </div>
    </div>
  );
}

