import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { SessionItem } from "@/lib/api-client";

export const Route = createFileRoute("/_authenticated/history")({
  component: History,
});

function History() {
  const [rows, setRows] = useState<SessionItem[] | null>(null);

  useEffect(() => {
    apiClient.listSessions().then(setRows).catch(() => setRows([]));
  }, []);

  if (rows === null) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">面试历史</h1>
          <p className="text-sm text-muted-foreground">共 {rows.length} 次面试记录</p>
        </div>
        <Button asChild><Link to="/new"><Plus className="w-4 h-4 mr-1" />新面试</Link></Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            还没有任何面试记录。<Link to="/new" className="text-primary hover:underline">立即开始</Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Link key={r.id} to="/session/$id" params={{ id: r.id }}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">{r.position}</CardTitle>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline">{r.difficulty}</Badge>
                        <Badge variant={r.status === "completed" ? "default" : "secondary"}>
                          {r.status === "completed" ? "已完成" : "进行中"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("zh-CN")}
                        </span>
                      </div>
                    </div>
                    {r.overall_score != null && (
                      <div className="text-right">
                        <div className="text-2xl font-bold text-primary">{r.overall_score}</div>
                        <div className="text-xs text-muted-foreground">综合评分</div>
                      </div>
                    )}
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
