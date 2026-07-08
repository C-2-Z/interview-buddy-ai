import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, History, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">欢迎回来 👋</h1>
        <p className="text-muted-foreground mt-1">开始一次新面试，或回顾历史表现。</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <CardTitle className="mt-2">开始新面试</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              选择岗位、难度并填写岗位需求描述，AI 会立刻生成定制题目。
            </p>
            <Button asChild>
              <Link to="/new">
                <Sparkles className="w-4 h-4 mr-1" />立即开始
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-accent text-accent-foreground flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <CardTitle className="mt-2">历史面试</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              查看你所有的面试记录、评分和 AI 反馈。
            </p>
            <Button variant="outline" asChild>
              <Link to="/history">查看历史</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
