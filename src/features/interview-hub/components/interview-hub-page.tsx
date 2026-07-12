/** interview-hub - 面试中心概览页 */
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  FileStack,
  Keyboard,
  Mic2,
  RotateCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useInterviewHub } from "../hooks/use-interview-hub";
import { isVoiceInterview, type RecentInterview } from "../types";

const ENTRY_CARDS = [
  {
    title: "Agent ??",
    description: "LangGraph ????????????????????????????",
    to: "/agent/new" as const,
    action: "?? Agent ??",
    icon: Bot,
    className: "bg-indigo-600 text-white",
  },

  {
    title: "文本面试",
    description: "逐题文字作答，适合梳理思路、打磨表达和复盘答案。",
    to: "/new" as const,
    action: "配置文本面试",
    icon: Keyboard,
    className: "bg-primary text-primary-foreground",
  },
  {
    title: "语音面试",
    description: "AI 主动提问并实时听答，模拟真实线上面试节奏。",
    to: "/voice/new" as const,
    action: "进入语音面试",
    icon: Mic2,
    className: "bg-foreground text-background",
  },
  {
    title: "简历面试",
    description: "从简历经历出发准备追问，让练习更贴近你的真实背景。",
    to: "/resumes" as const,
    action: "选择一份简历",
    icon: FileStack,
    className: "bg-success text-success-foreground",
  },
];

/**
 * recent interview action
 *
 * @param session -
 * @returns
 */
function RecentInterviewAction({ session }: { session: RecentInterview }) {
  if (session.status === "completed") {
    return (
      <Button variant="outline" size="sm" className="min-h-10" asChild>
        <Link to="/interviews/$id" params={{ id: session.id }}>
          查看报告
        </Link>
      </Button>
    );
  }

  return isVoiceInterview(session) ? (
    <Button variant="outline" size="sm" className="min-h-10" asChild>
      <Link to="/voice/session/$id" params={{ id: session.id }}>
        继续面试
      </Link>
    </Button>
  ) : (
    <Button variant="outline" size="sm" className="min-h-10" asChild>
      <Link to="/session/$id" params={{ id: session.id }}>
        继续面试
      </Link>
    </Button>
  );
}

/**
 * interview hub page
 * @returns
 */
export function InterviewHubPage() {
  const hub = useInterviewHub();

  return (
    <div className="space-y-10">
      <header className="max-w-3xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          <BriefcaseBusiness className="size-4" />
          职业面试训练工作台
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">今天想练习哪一种面试？</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          文本与语音是两条独立练习流程。选择最适合当前目标的方式，AI 会根据岗位和难度准备问题。
        </p>
      </header>

      <section aria-labelledby="start-interview-heading">
        <h2 id="start-interview-heading" className="sr-only">
          开始面试
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {ENTRY_CARDS.map((entry) => {
            const Icon = entry.icon;
            return (
              <Card
                key={entry.title}
                className="group flex min-h-64 flex-col overflow-hidden border-border/80 transition-[border-color,box-shadow] duration-200 hover:border-primary/35 hover:shadow-lg"
              >
                <CardHeader>
                  <span
                    className={`flex size-12 items-center justify-center rounded-2xl ${entry.className}`}
                  >
                    <Icon className="size-6" />
                  </span>
                  <CardTitle className="pt-3 text-xl">{entry.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <p className="flex-1 text-sm leading-6 text-muted-foreground">
                    {entry.description}
                  </p>
                  <Button className="mt-6 min-h-11 w-full justify-between" asChild>
                    <Link to={entry.to}>
                      {entry.action}
                      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="recent-interviews-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="recent-interviews-heading" className="text-xl font-semibold">
              最近面试
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              快速继续未完成的练习，或查看已经生成的报告。
            </p>
          </div>
          <Button variant="ghost" className="min-h-11" asChild>
            <Link to="/interviews">
              查看全部记录
              <ArrowRight />
            </Link>
          </Button>
        </div>

        {hub.loading ? (
          <div className="grid gap-3" aria-label="正在加载最近面试">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : hub.error ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">{hub.error}</p>
              <Button variant="outline" onClick={() => void hub.refresh()} className="min-h-11">
                <RotateCw />
                重新加载
              </Button>
            </CardContent>
          </Card>
        ) : hub.sessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <CheckCircle2 className="size-8 text-primary" />
              <h3 className="mt-3 font-semibold">从第一次练习开始</h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                完成面试后，这里会保留进度、得分和报告入口。
              </p>
              <Button className="mt-5 min-h-11" asChild>
                <Link to="/new">创建文本面试</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {hub.sessions.map((session) => (
              <Card key={session.id} className="border-border/80">
                <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      {isVoiceInterview(session) ? (
                        <Mic2 className="size-5" />
                      ) : (
                        <Keyboard className="size-5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{session.position}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">
                          {isVoiceInterview(session) ? "语音" : "文本"}
                        </Badge>
                        <span>{session.difficulty}</span>
                        <span>{new Date(session.created_at).toLocaleString("zh-CN")}</span>
                      </div>
                    </div>
                  </div>
                  {session.overall_score != null && (
                    <div className="text-left sm:text-right">
                      <span className="text-2xl font-bold tabular-nums text-primary">
                        {session.overall_score}
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground">分</span>
                    </div>
                  )}
                  <RecentInterviewAction session={session} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
