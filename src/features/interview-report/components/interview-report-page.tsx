/** Interview report 页面：展示总评、维度、逐题证据并生成弱项复练草稿。 */
import { useMemo } from "react";
import { ArrowLeft, Loader2, RotateCw, Target } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentActivityPanel } from "@/features/agent-orchestration/components/agent-activity-panel";
import { useInterviewReport } from "../hooks/use-interview-report";
import type { InterviewReportDimension } from "../types";

/** 将逐题维度评分聚合为稳定的平均分列表。 */
function aggregateDimensions(
  report: NonNullable<ReturnType<typeof useInterviewReport>["report"]>,
): InterviewReportDimension[] {
  const values = new Map<string, number[]>();
  for (const question of report.questions) {
    for (const [key, dimension] of Object.entries(question.evaluation?.dimensions ?? {})) {
      values.set(key, [...(values.get(key) ?? []), dimension.score]);
    }
  }
  return [...values.entries()]
    .map(([key, scores]) => ({
      key,
      score: Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length),
      count: scores.length,
    }))
    .sort((left, right) => left.score - right.score);
}

/** 独立报告页属性。 */
export type InterviewReportPageProps = {
  /** 已完成或提前结束的 Agent 会话 UUID。 */ sessionId: string;
};

/** 在深链接中恢复报告，并允许围绕最低分维度创建新的训练草稿。 */
export function InterviewReportPage({ sessionId }: InterviewReportPageProps) {
  const navigate = useNavigate();
  const state = useInterviewReport(sessionId);
  const dimensions = useMemo(
    () => (state.report ? aggregateDimensions(state.report) : []),
    [state.report],
  );
  /** 将原岗位与最低分能力写入创建向导草稿，用户仍可在开始前修改。 */
  function practiceWeakness() {
    if (!state.report) return;
    const weakest = dimensions[0]?.key ?? "综合表达";
    window.localStorage.setItem(
      "ezmock:text-interview-setup-draft:v2",
      JSON.stringify({
        mode: "single",
        position: state.report.config.position,
        difficulty: state.report.config.difficulty,
        questionCount: 5,
        targetCompany: state.report.config.targetCompany ?? "",
        jobDescription: `本轮重点训练弱项：${weakest}。请围绕该能力增加追问和情境题。`,
        modelProvider: "deepseek",
        webResearch: true,
      }),
    );
    void navigate({ to: "/new" });
  }
  if (state.loading && !state.report)
    return (
      <div className="flex min-h-96 items-center justify-center" aria-live="polite">
        <Loader2 className="size-8 animate-spin" />
        <span className="sr-only">正在加载报告</span>
      </div>
    );
  if (state.error || !state.report)
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p role="alert" className="text-destructive">
          {state.error ?? "报告不存在或无权访问。"}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => void state.refresh()}>
          <RotateCw />
          重试加载
        </Button>
      </div>
    );
  const report = state.report;
  if (!report.report)
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p role="alert">本场尚未生成报告。请先完成面试或选择“提前结束并生成报告”。</p>
        <Button className="mt-4" asChild>
          <Link to="/session/$id" params={{ id: sessionId }}>
            返回面试
          </Link>
        </Button>
      </div>
    );
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" asChild>
            <Link to="/session/$id" params={{ id: sessionId }}>
              <ArrowLeft />
              返回会话
            </Link>
          </Button>
          <h1 className="mt-3 text-3xl font-bold">{report.config.position} 面试报告</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {report.config.difficulty} · {report.questions.length} 道题 ·{" "}
            {report.productStatus === "completed" ? "已完成" : "阶段性报告"}
          </p>
        </div>
        <Button onClick={practiceWeakness}>
          <Target />
          针对最弱项再练一次
        </Button>
      </header>
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="grid gap-6 py-6 sm:grid-cols-[140px_1fr]">
          <div>
            <div className="text-6xl font-bold tabular-nums text-primary">
              {report.report.overallScore}
            </div>
            <div className="text-sm text-muted-foreground">综合评分</div>
          </div>
          <p className="leading-7">{report.report.overallFeedback}</p>
        </CardContent>
      </Card>
      <AgentActivityPanel strategy={report.strategy} activities={report.activities} />
      <section aria-labelledby="dimension-heading">
        <h2 id="dimension-heading" className="mb-3 text-xl font-semibold">
          能力维度
        </h2>
        {dimensions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              暂无已评分维度；阶段性报告可能在首题评分前生成。
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dimensions.map((dimension, index) => (
              <Card key={dimension.key}>
                <CardContent className="py-5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{dimension.key}</span>
                    {index === 0 && <Badge variant="secondary">优先提升</Badge>}
                  </div>
                  <div className="mt-3 text-3xl font-bold tabular-nums">{dimension.score}</div>
                  <div className="text-xs text-muted-foreground">
                    基于 {dimension.count} 道已评分题目
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
      <section aria-labelledby="question-heading">
        <h2 id="question-heading" className="mb-3 text-xl font-semibold">
          逐题复盘
        </h2>
        <div className="space-y-3">
          {report.questions.map((question) => (
            <Card key={question.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    第 {question.orderIndex + 1} 题 · {question.dimensionKey}
                  </CardTitle>
                  <Badge variant={question.evaluation ? "default" : "secondary"}>
                    {question.evaluation ? `${question.evaluation.overallScore} 分` : "未评分"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-medium leading-6">{question.question}</p>
                {question.feedback && (
                  <p className="text-sm leading-6 text-muted-foreground">{question.feedback}</p>
                )}
                {question.evidence.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">回答证据</div>
                    {question.evidence.slice(0, 3).map((evidence) => (
                      <blockquote
                        key={evidence.id}
                        className="border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground"
                      >
                        “{evidence.quote}”
                      </blockquote>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
