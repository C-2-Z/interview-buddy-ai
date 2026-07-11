/** interview-session - 已完成面试状态 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Keyboard, Mic2, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { QuestionItem, SessionDetail } from "../types";
import { EvaluationRadar } from "@/components/evaluation-radar";

/**
 * completed session
 * @returns
 */
export function CompletedSession({
  session,
  questions,
}: {
  session: SessionDetail;
  questions: QuestionItem[];
}) {
  const isVoice = session.interview_mode === "voice" || session.voice_mode === true;
  const scoredCount = questions.filter((question) => question.score != null).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card className="overflow-hidden border-primary/20">
        <CardContent className="flex flex-col items-center py-10 text-center sm:py-14">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Trophy className="size-8" />
          </span>
          <Badge variant="outline" className="mt-5">
            {isVoice ? "语音面试" : "文本面试"} · {session.difficulty}
          </Badge>
          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">面试已完成</h1>
          <p className="mt-2 text-muted-foreground">{session.position}</p>
          <div className="mt-7 flex items-center gap-8 rounded-2xl bg-muted/45 px-8 py-5">
            <div>
              <div className="text-3xl font-bold tabular-nums text-primary">
                {session.overall_score ?? "—"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">综合评分</div>
            </div>
            <div className="h-10 w-px bg-border" />
            <div>
              <div className="inline-flex items-center gap-1 text-2xl font-semibold tabular-nums">
                <CheckCircle2 className="size-5 text-success" />
                {scoredCount}/{questions.length}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">已评分题目</div>
            </div>
          </div>
          <p className="mt-6 max-w-xl text-sm leading-7 text-muted-foreground">
            {session.overall_feedback || "详细报告已经准备好，你可以逐题查看回答与 AI 反馈。"}
          </p>
          {session.dimension_summary && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">能力维度</h3>
              <EvaluationRadar summary={session.dimension_summary} compact />
            </div>
          )}

          <div className="mt-7 grid w-full max-w-md gap-3 sm:grid-cols-2">
            <Button className="min-h-11" asChild>
              <Link to="/interviews/$id" params={{ id: session.id }}>
                查看完整报告
                <ArrowRight />
              </Link>
            </Button>
            <Button variant="outline" className="min-h-11" asChild>
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
        </CardContent>
      </Card>
    </div>
  );
}
