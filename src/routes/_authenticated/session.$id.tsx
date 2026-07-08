import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import type { SessionDetail, QuestionItem } from "@/lib/api-client";
import { Loader2, CheckCircle2, ArrowRight, Trophy, Send, Sparkles, User, Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/session/$id")({
  component: SessionPage,
});

type Message = {
  id: string;
  question_id?: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function SessionPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const res = await apiClient.getSession(id);
    setSession(res.session);
    setQuestions(res.questions);
    const firstUnanswered = res.questions.findIndex((q) => q.score == null);
    setCurrent(firstUnanswered >= 0 ? firstUnanswered : res.questions.length - 1);
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  const q = questions[current];

  useEffect(() => {
    if (q && q.score == null && q.answer) {
      try { setMessages(JSON.parse(q.answer)); } catch { setMessages([]); }
    } else {
      setMessages([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, q?.id, q?.score]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!session) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" /></div>;
  }

  const isComplete = session.status === "completed";
  const allAnswered = questions.length > 0 && questions.every((qq) => qq.score != null);
  const answeredCount = questions.filter((qq) => qq.score != null).length;
  const progress = questions.length ? (answeredCount / questions.length) * 100 : 0;

  async function handleSendMessage() {
    if (!q || !message.trim()) {
      toast.error("请输入你的回答");
      return;
    }
    const text = message.trim();
    setMessage("");
    setSending(true);

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: "temp-" + Date.now(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const result = await apiClient.sendMessage(q.id, text);

      // Add AI response
      const tempAiMsg: Message = {
        id: "temp-" + Date.now(),
        role: "assistant",
        content: result.response,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempAiMsg]);

      // If AI signaled conversation complete, auto-update score/feedback
      if (result.done && result.score != null) {
        setQuestions((prev) =>
          prev.map((qq, i) =>
            i === current
              ? { ...qq, score: result.score!, feedback: result.feedback ?? "" }
              : qq
          )
        );
        toast.success("评分完成");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发送失败");
      // Re-fetch to revert optimistic update
      try {
        const refreshed = await apiClient.getSession(id);
        const refreshedQ = refreshed.questions.find((x) => x.id === q.id);
        if (refreshedQ?.answer) {
          try { setMessages(JSON.parse(refreshedQ.answer)); } catch { setMessages([]); }
        } else {
          setMessages([]);
        }
      } catch { /* ignore refetch errors */ }
    } finally {
      setSending(false);
    }
  }

  async function handleEvaluate() {
    if (!q) return;
    setEvaluating(true);
    try {
      await apiClient.evaluateConversation(q.id);
      toast.success("评分完成");
      await refresh();
      setMessages([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "评分失败");
    } finally {
      setEvaluating(false);
    }
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      await apiClient.finishSession(id);
      await refresh();
      toast.success("面试已完成");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "完成失败");
    } finally {
      setFinishing(false);
    }
  }

  function nextQuestion() {
    if (current < questions.length - 1) {
      setCurrent(current + 1);
      setMessage("");
    }
  }

  // Check if AI has indicated the conversation is ready to conclude
  const canConclude = messages.length >= 2 && !evaluating;

  // ====== COMPLETED VIEW ======
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

  // ====== ACTIVE SESSION VIEW ======
  return (
    <div className="space-y-4">
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
            onClick={() => { setCurrent(i); setMessage(""); }}
            disabled={qq.score == null && i > current + 1}
            className={`w-9 h-9 rounded-md border text-sm font-medium transition-colors disabled:opacity-30 ${
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
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <Badge variant="outline" className="w-fit">第 {current + 1} 题</Badge>
            <CardTitle className="text-lg leading-relaxed">{q.question}</CardTitle>
          </CardHeader>

          {q.score != null ? (
            // ====== ANSWERED VIEW ======
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 max-h-60 overflow-y-auto space-y-3">
                {messages.map((msg, i) => (
                  <div key={msg.id || i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarFallback className={msg.role === "user" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"}>
                        {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
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
                  <Button onClick={nextQuestion}>
                    下一题 <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
                {allAnswered && (
                  <Button onClick={handleFinish} disabled={finishing}>
                    {finishing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />总结中…</> : "完成面试并生成总结"}
                  </Button>
                )}
              </div>
            </CardContent>
          ) : (
            // ====== CONVERSATION VIEW (unanswered) ======
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-card max-h-[400px] min-h-[200px] overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    开始你的回答，面试官会与你进行多轮对话
                  </div>
                ) : (
                  <>
                    {messages.map((msg, i) => (
                      <div key={msg.id || i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                        <Avatar className="w-8 h-8 flex-shrink-0">
                          <AvatarFallback className={msg.role === "user" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"}>
                            {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {sending && (
                      <div className="flex gap-3">
                        <Avatar className="w-8 h-8 flex-shrink-0">
                          <AvatarFallback className="bg-accent text-accent-foreground">
                            <Bot className="w-4 h-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="bg-muted rounded-lg px-3 py-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="space-y-3">
                <Textarea
                  placeholder="输入你的回答…面试官会针对你的回答继续追问"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={5000}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{message.length}/5000</span>
                  <div className="flex items-center gap-2">
                    {canConclude && (
                      <Button variant="outline" onClick={handleEvaluate} disabled={evaluating}>
                        {evaluating ? (
                          <><Loader2 className="w-4 h-4 mr-1 animate-spin" />AI 评分中…</>
                        ) : "结束对话并评分"}
                      </Button>
                    )}
                    <Button onClick={handleSendMessage} disabled={sending || !message.trim()}>
                      {sending ? (
                        <><Loader2 className="w-4 h-4 mr-1 animate-spin" />发送中…</>
                      ) : (
                        <><Send className="w-4 h-4 mr-1" />发送</>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
