import { AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { GenerationSnapshot } from "../types";

export function GenerationProgress(props: {
  snapshot: GenerationSnapshot | null;
  retrying: boolean;
  onRetry: () => void;
}) {
  const snapshot = props.snapshot;
  if (!snapshot || snapshot.status === "ready") return null;
  const percentage =
    snapshot.requestedCount > 0
      ? Math.min(100, (snapshot.generatedCount / snapshot.requestedCount) * 100)
      : 0;
  const failed = snapshot.status === "failed";
  return (
    <Card className={failed ? "border-destructive/40" : "border-primary/25"}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {failed ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
          ) : snapshot.generatedCount > 0 ? (
            <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
          ) : (
            <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              {failed
                ? "剩余题目生成遇到问题"
                : snapshot.generatedCount > 0
                  ? "可以开始，剩余题目继续生成中"
                  : "正在生成第一道面试题"}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              已生成 {snapshot.generatedCount} / {snapshot.requestedCount} 道题
            </div>
            <Progress value={percentage} className="mt-2 h-1.5" />
          </div>
        </div>
        {failed && (
          <Button type="button" variant="outline" onClick={props.onRetry} disabled={props.retrying}>
            {props.retrying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            重试生成
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
