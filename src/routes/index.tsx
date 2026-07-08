import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles, Target, MessageSquare, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI 面试模拟器 · 智能练习与反馈" },
      { name: "description", content: "选择岗位与难度，AI 出题、评分并给出改进建议，帮助你在真正的面试中脱颖而出。" },
      { property: "og:title", content: "AI 面试模拟器" },
      { property: "og:description", content: "选择岗位与难度，AI 出题、评分并给出改进建议。" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/40">
      <header className="mx-auto max-w-6xl px-4 py-5 flex items-center justify-between">
        <div className="font-semibold text-lg tracking-tight">AI 面试模拟器</div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link to="/auth">登录</Link>
          </Button>
          <Button asChild>
            <Link to="/auth">开始练习</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          由 AI 驱动的面试练习平台
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight">
          让每一次面试
          <br />
          都<span className="bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">胸有成竹</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          选择岗位与难度，输入岗位需求描述，AI 会为你生成定制面试题，逐题评分并给出可执行的改进建议。
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/auth">免费开始</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20 grid gap-6 sm:grid-cols-3">
        <Feature icon={<Target className="w-5 h-5" />} title="定制出题" desc="根据岗位、难度和你的背景，生成贴合的面试题" />
        <Feature icon={<MessageSquare className="w-5 h-5" />} title="逐题反馈" desc="AI 对每道题独立评分，给出优缺点与改进建议" />
        <Feature icon={<TrendingUp className="w-5 h-5" />} title="持续追踪" desc="所有历史记录自动保存，方便复盘与提升" />
      </section>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
