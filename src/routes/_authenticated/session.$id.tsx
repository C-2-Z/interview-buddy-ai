import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { getSession, evaluateAnswer, finishSession } from "@/lib/interview.functions";
import { Loader2, CheckCircle2, ArrowRight, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/session/$id")({
  component: SessionPage,
});

type Question = {
  id: string;
  order_index: number;
  question: string;
  answer: string | null;
  score: number | null;
  feedback: string | null;
};
type Session = {
  id: string;
  position: string;
  difficulty: string;
  status: string;
  overall_score: number | null;
  overall_feedback: string | null;
};

function SessionPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const load = useServerFn(getSession);
  const evaluate = useServerFn(evaluateAnswer);
  const finish = useServerFn(finishSession);

  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const refresh = useCallback(async () => {
    const res = await load({ data: { sessionId: id } });
    setSession(res.session as Session);
    setQuestions(res.questions as Question[]);
    const firstUnanswered = (res.questions as Question[]).findIndex((q) => q.score == null);
    setCurrent(firstUnanswered >= 0 ? firstUnanswered : (res.questions as Question[]).length - 1);
  }, [id, load]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!session) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" /></div>;
  }

  const isComplete = session.status === "completed";
  const allAnswered = questions.length > 0 && questions.every((q) => q.score != null);
  const q = questions[current];
  const answeredCount = questions.filter((qq) => qq.score != null).length;
  const progress = questions.length ? (answeredCount / questions.length) * 100 : 0;

  async function submitAnswer() {
    if (!q || !answer.trim()) {
      toast.error("请输入你的回答");
      return;
    }
    setSubmitting(true);
    try {
      await evaluate({ data: { questionId: q.id, answer } });
      toast.success("已评分");
      setAnswer("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "评分失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      await finish({ data: { sessionId: id } });
      await refresh();
      toast.success("面试已完成");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "完成失败");
    } finally {
      setFinishing(false);
    }
  }

  if (isComplete) {
    return (
      <div className="space-y-6">
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <CardTitle>面试完成</CardTitle>
                <CardDescription>{session.position} · {session.difficulty}</CardDescription>
              </div>
              <div className="ml-auto text-right">
                <div className="text-3xl font-bold text-primary">{session.overall_score ?? 0}</div>
                <div className="text-xs text-muted-foreground">综合评分</div>
              </div>
            </div>
          </CardHeader>
          {session.overall_feedback && (
            <CardContent>
              <h3 className="font-semibold mb-2">AI 综合评价</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {session.overall_feedback}
              </p>
            </CardContent>
          )}
        </Card>

        {questions.map((qq, i) => (
          <Card key={qq.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Badge variant="outline">第 {i + 1} 题</Badge>
                  <CardTitle className="mt-2 text-base">{qq.question}</CardTitle>
                </div>
                <div className="text-2xl font-bold text-primary">{qq.score}</div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">你的回答</div>
                <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-3">{qq.answer}</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">AI 反馈</div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{qq.feedback}</p>
              </div>
            </CardContent>
          </Card>
        ))}

        <div className="flex gap-2">
          <Button asChild><Link to="/new">再来一次</Link></Button>
          <Button variant="outline" asChild><Link to="/history">查看历史</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge>{session.position}</Badge>
          <Badge variant="outline">{session.difficulty}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={progress} className="flex-1" />
          <span className="text-sm text-muted-foreground">{answeredCount}/{questions.length}</span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {questions.map((qq, i) => (
          <button
            key={qq.id}
            onClick={() => { setCurrent(i); setAnswer(""); }}
            className={`w-9 h-9 rounded-md border text-sm font-medium transition-colors ${
              i === current ? "bg-primary text-primary-foreground border-primary" :
              qq.score != null ? "bg-primary/10 text-primary border-primary/30" :
              "bg-card hover:bg-accent"
            }`}
          >
            {qq.score != null ? <CheckCircle2 className="w-4 h-4 mx-auto" /> : i + 1}
          </button>
        ))}
      </div>

      {q && (
        <Card>
          <CardHeader>
            <Badge variant="outline" className="w-fit">第 {current + 1} 题</Badge>
            <CardTitle className="text-lg leading-relaxed">{q.question}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {q.score != null ? (
              <>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">你的回答</div>
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-3">{q.answer}</p>
                </div>
                <div className="rounded-lg border bg-primary/5 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold">AI 评分与反馈</div>
                    <div className="text-2xl font-bold text-primary">{q.score}</div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{q.feedback}</p>
                </div>
                <div className="flex gap-2">
                  {current < questions.length - 1 && (
                    <Button onClick={() => { setCurrent(current + 1); setAnswer(""); }}>
                      下一题 <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                  {allAnswered && (
                    <Button onClick={handleFinish} disabled={finishing}>
                      {finishing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />总结中…</> : "完成面试并生成总结"}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <Textarea
                  placeholder="在此输入你的回答…"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={8}
                  maxLength={5000}
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">{answer.length}/5000</span>
                  <Button onClick={submitAnswer} disabled={submitting}>
                    {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />AI 评分中…</> : "提交回答"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
