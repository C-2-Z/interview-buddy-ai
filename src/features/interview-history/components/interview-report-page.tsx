import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Keyboard, Mic2, RotateCw, Trophy } from "lucide-react";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useInterviewReport } from "../hooks/use-interview-report";
import { isVoiceSession } from "../types";

export function InterviewReportPage({ sessionId }: { sessionId: string }) {
  const reportState = useInterviewReport(sessionId);
  const [expandedQuestions, setExpandedQuestions] = useState<string[]>([]);

  if (reportState.loading) {
    return (
      <div className="space-y-4" aria-label="正在加载面试报告">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  if (!reportState.report || reportState.error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <Trophy className="size-9 text-muted-foreground" />
          <div>
            <h1 className="font-semibold">无法打开面试报告</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {reportState.error || "该记录不存在。"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void reportState.refresh()}>
              <RotateCw />
              重试
            </Button>
            <Button asChild>
              <Link to="/interviews">返回记录</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { session, questions } = reportState.report;
  const isVoice = isVoiceSession(session);
  const questionValues = questions.map((question) => question.id);

  function printReport() {
    setExpandedQuestions(questionValues);
    window.setTimeout(() => window.print(), 50);
  }

  return (
    <div data-print-root="true" className="space-y-6">
      <header
        data-print-hidden="true"
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <Button variant="ghost" className="min-h-11 self-start" asChild>
          <Link to="/interviews">
            <ArrowLeft />
            返回面试记录
          </Link>
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="min-h-11" onClick={printReport}>
            <Download />
            导出 PDF
          </Button>
          <Button className="min-h-11" asChild>
            {isVoice ? (
              <Link to="/voice/new" search={{ sourceSessionId: session.id }}>
                <Mic2 />
                再来一次
              </Link>
            ) : (
              <Link to="/new" search={{ sourceSessionId: session.id }}>
                <Keyboard />
                再来一次
              </Link>
            )}
          </Button>
        </div>
      </header>

      <Card data-print-break="avoid" className="overflow-hidden border-primary/20">
        <CardContent className="grid gap-6 py-7 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{isVoice ? "语音面试" : "文本面试"}</Badge>
              <Badge variant="outline">{session.difficulty}</Badge>
              <Badge variant={session.status === "completed" ? "default" : "secondary"}>
                {session.status === "completed" ? "已完成" : "未完成"}
              </Badge>
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
              {session.position}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {new Date(session.created_at).toLocaleString("zh-CN")}
            </p>
          </div>
          <div className="rounded-2xl bg-primary/8 px-7 py-5 text-center">
            {session.overall_score == null ? (
              <div className="text-sm text-muted-foreground">暂无综合评分</div>
            ) : (
              <>
                <div className="text-4xl font-bold tabular-nums text-primary">
                  {session.overall_score}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">综合评分 / 100</div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card data-print-break="avoid">
        <CardHeader>
          <CardTitle className="text-lg">AI 综合评价</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/85">
            {session.overall_feedback ||
              "本次面试尚未生成综合评价。完成更多题目后再结束面试，可以获得更完整的总结。"}
          </p>
        </CardContent>
      </Card>

      <section aria-labelledby="question-review-heading" className="space-y-3">
        <div>
          <h2 id="question-review-heading" className="text-xl font-semibold">
            逐题回顾
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            所有内容都来自本次实际面试记录，不补充未生成的参考答案。
          </p>
        </div>
        <Accordion
          type="multiple"
          value={expandedQuestions}
          onValueChange={setExpandedQuestions}
          className="space-y-3"
        >
          {questions.map((question, index) => (
            <AccordionItem
              key={question.id}
              value={question.id}
              data-print-break="avoid"
              className="rounded-2xl border bg-card px-5 last:border-b"
            >
              <AccordionTrigger className="gap-4 py-5 hover:no-underline">
                <span className="flex min-w-0 flex-1 items-start gap-3 text-left">
                  <Badge variant="outline" className="shrink-0">
                    第 {index + 1} 题
                  </Badge>
                  <span className="line-clamp-2 font-medium leading-6">{question.question}</span>
                </span>
                <span className="shrink-0 text-right">
                  {question.score == null ? (
                    <span className="text-xs text-muted-foreground">未评分</span>
                  ) : (
                    <span className="text-lg font-bold tabular-nums text-primary">
                      {question.score}
                    </span>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 border-t pt-4">
                <div>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">你的回答</div>
                  <div className="rounded-xl bg-muted/50 p-4 text-sm leading-7 whitespace-pre-wrap">
                    {question.answer || "本题没有保存回答。"}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">AI 反馈</div>
                  <p className="text-sm leading-7 whitespace-pre-wrap">
                    {question.feedback || "本题尚未生成评分反馈。"}
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {questions.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              这次面试没有可回顾的题目。
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
