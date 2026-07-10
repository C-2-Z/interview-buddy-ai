import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, History, Sparkles, Mic2 } from "lucide-react";

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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <CardTitle className="mt-2">文字面试</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              按题卡逐题作答，使用文字对话完成追问、评分和总结。
            </p>
            <Button asChild>
              <Link to="/new">
                <Sparkles className="w-4 h-4 mr-1" />创建文字面试
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Mic2 className="w-5 h-5" />
            </div>
            <CardTitle className="mt-2">语音面试</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              AI 面试官实时读题、听答、追问，并像真实面试一样推进流程。
            </p>
            <Button asChild>
              <Link to="/voice/new">
                <Mic2 className="w-4 h-4 mr-1" />创建语音面试
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
