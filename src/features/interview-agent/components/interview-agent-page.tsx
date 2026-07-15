/** 文字 Agent 工作台：多轮文本回答、研究、证据、评分与统一报告。 */
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Loader2, RotateCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { AgentActivityPanel } from "@/features/agent-orchestration/components/agent-activity-panel";
import { AgentPreparationProgress } from "@/features/agent-orchestration/components/agent-preparation-progress";
import { InterviewLifecycleActions } from "@/features/interview-lifecycle/components/interview-lifecycle-actions";
import { useInterviewLifecycle } from "@/features/interview-lifecycle/hooks/use-interview-lifecycle";
import type { InterviewLifecycleAction } from "@/features/interview-lifecycle/types";
import { useAnswerDraft } from "../hooks/use-answer-draft";
import { useAgentSession } from "../hooks/use-agent-session";
import {
  AGENT_PHASE_DISPLAY,
  AGENT_ROLE_DISPLAY,
  type AgentRoleId,
  type AgentWorkspaceMessage,
} from "../types";
import { ContentPhaseIndicator } from "./content-phase-indicator";
import { RoundIndicator } from "./round-indicator";

/** 页面参数。 */
export type InterviewAgentPageProps = Readonly<{
  /** 已创建的 Agent 会话 UUID。 */ sessionId: string;
  /** voice session 明确降级到同一 Graph 的文字输入。 */ allowVoiceTextFallback?: boolean;
}>;

/** 时间线消息增加题目/角色元数据。 */
type TimelineMessage = AgentWorkspaceMessage & {
  roleId: AgentRoleId;
  questionId: string;
  kind: "question" | "message";
};

/** 将题目和对话投影为稳定时间线。 */
function buildTimeline(
  workspace: NonNullable<ReturnType<typeof useAgentSession>["workspace"]>,
): TimelineMessage[] {
  return workspace.questions.flatMap((question) => [
    {
      id: `question:${question.id}`,
      role: "assistant" as const,
      content: question.question,
      source: "text" as const,
      interrupted: false,
      createdAt: "",
      roleId: question.roleId,
      questionId: question.id,
      kind: "question" as const,
    },
    ...question.messages.map((message) => ({
      ...message,
      roleId: question.roleId,
      questionId: question.id,
      kind: "message" as const,
    })),
  ]);
}

/** 返回角色 Badge 样式。 */
function roleClass(role: AgentRoleId): string {
  return `${AGENT_ROLE_DISPLAY[role].color} text-white`;
}

/** 完成后的统一报告摘要。 */
function ReportCard({
  score,
  feedback,
}: {
  /** 综合得分。 */ score: number;
  /** 冻结综合反馈。 */ feedback: string;
}) {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle>面试报告</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="text-5xl font-bold tabular-nums text-primary">{score}</div>
        <p className="text-sm leading-6 text-muted-foreground">{feedback}</p>
      </CardContent>
    </Card>
  );
}

/** 文字练习主页面。 */
export function InterviewAgentPage({
  sessionId,
  allowVoiceTextFallback = false,
}: InterviewAgentPageProps) {
  const navigate = useNavigate();
  const session = useAgentSession(sessionId);
  const lifecycle = useInterviewLifecycle(sessionId);
  const answer = useAnswerDraft(sessionId);
  const workspace = session.workspace;
  const snapshot = session.snapshot;
  const timeline = useMemo(() => (workspace ? buildTimeline(workspace) : []), [workspace]);

  useEffect(() => {
    if (
      !snapshot ||
      snapshot.interviewMode !== "voice" ||
      snapshot.phase === "completed" ||
      allowVoiceTextFallback
    )
      return;
    void navigate({ to: "/voice/session/$id", params: { id: sessionId }, replace: true });
  }, [allowVoiceTextFallback, navigate, sessionId, snapshot]);

  /** 提交多行文字回答；失败时完整恢复本地草稿。 */
  const submit = useCallback(async () => {
    const content = answer.draft.trim();
    if (!content) return;
    try {
      await session.submitInput(content);
      answer.clear();
    } catch {
      // useAnswerDraft 已持久化正文，失败时无需复制或清空。
    }
  }, [answer, session]);

  /** 执行暂停、恢复、提前结束或放弃，并用服务端投影刷新当前工作台。 */
  const transitionLifecycle = useCallback(
    async (action: InterviewLifecycleAction) => {
      try {
        const result = await lifecycle.transition(action);
        await session.refresh();
        if (action === "finish" && result.reportAvailable) {
          await navigate({ to: "/report/$id", params: { id: sessionId } });
        } else if (action === "abandon") {
          await navigate({ to: "/history" });
        }
      } catch {
        // Hook 已保留稳定错误；回答草稿和当前页面不发生破坏性变化。
      }
    },
    [lifecycle, navigate, session, sessionId],
  );

  /** 二次确认后删除整场记录，成功时返回历史列表。 */
  const deleteSession = useCallback(async () => {
    if (!window.confirm("删除后将无法恢复这场面试，确定继续吗？")) return;
    try {
      await lifecycle.remove();
      await navigate({ to: "/history" });
    } catch {
      // Hook 已展示可重试错误，保留当前报告与页面上下文。
    }
  }, [lifecycle, navigate]);

  if (session.loading && !workspace)
    return (
      <div className="flex min-h-96 items-center justify-center" aria-live="polite">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <span className="sr-only">正在恢复面试</span>
      </div>
    );
  if (!workspace || !snapshot)
    return (
      <div className="mx-auto max-w-lg py-16 text-center" role="alert">
        <p className="text-destructive">{session.error ?? "无法加载 Agent 会话"}</p>
        <Button variant="outline" className="mt-4 min-h-11" onClick={() => void session.refresh()}>
          <RotateCw />
          重试
        </Button>
      </div>
    );
  if (
    snapshot.interviewMode === "voice" &&
    snapshot.phase !== "completed" &&
    !allowVoiceTextFallback
  )
    return (
      <div className="flex min-h-96 items-center justify-center" aria-live="polite">
        <p className="text-sm text-muted-foreground">正在进入沉浸式语音面试…</p>
      </div>
    );

  const canAnswer =
    snapshot.phase === "awaiting_answer" && workspace.productStatus === "in_progress";
  const completed = snapshot.phase === "completed";
  const showProcessDetails = workspace.config.experienceMode === "coaching" || completed;
  const interviewFinished = completed || ["abandoned", "failed"].includes(workspace.productStatus);

  return (
    <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-2xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="返回上一页"
              onClick={() => window.history.back()}
            >
              <ArrowLeft />
            </Button>
            <div>
              <h1 className="font-semibold">
                {workspace.config.position} · {completed ? "复盘报告" : "文字练习"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {workspace.config.difficulty} · {workspace.config.questionCount} 题
                {allowVoiceTextFallback ? " · 已从语音降级" : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={session.connected ? "default" : "secondary"}>
              {session.connected ? "事件流在线" : "轮询恢复"}
            </Badge>
            <Badge variant="outline">{AGENT_PHASE_DISPLAY[snapshot.phase]}</Badge>
            <Badge className={roleClass(snapshot.currentRole)}>
              {AGENT_ROLE_DISPLAY[snapshot.currentRole].label}
            </Badge>
          </div>
        </header>
        {showProcessDetails && <ContentPhaseIndicator workspace={workspace} snapshot={snapshot} />}
        <div
          className="flex min-h-10 flex-wrap gap-3 border-b px-4 py-2 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <span>
            第 {Math.min(snapshot.currentQuestionIndex + 1, workspace.config.questionCount)} /{" "}
            {workspace.config.questionCount} 题
          </span>
          {showProcessDetails && <span>追问 {snapshot.followUpCount}/3</span>}
          {showProcessDetails && <RoundIndicator workspace={workspace} snapshot={snapshot} />}
          {session.error && (
            <span className="text-destructive" role="alert">
              {session.error}
            </span>
          )}
        </div>
        <div className="border-b px-4 py-3">
          <InterviewLifecycleActions
            status={workspace.productStatus}
            pending={lifecycle.pending}
            error={lifecycle.error}
            onAction={(action) => void transitionLifecycle(action)}
            onDelete={() => void deleteSession()}
          />
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {timeline.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {message.role === "assistant" && (
                    <div className="mb-1 flex items-center gap-2 text-xs opacity-70">
                      <Badge className={`${roleClass(message.roleId)} px-1.5 py-0 text-[10px]`}>
                        {AGENT_ROLE_DISPLAY[message.roleId].label}
                      </Badge>
                      {message.kind === "question" && <span>正式题目</span>}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  {message.role === "user" && (
                    <div className="mt-1 text-right text-[10px] opacity-70">
                      {message.source === "voice" ? "语音识别" : "文字输入"}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {timeline.length === 0 && (
              snapshot.phase === "preparing" ? (
                <div className="py-6 sm:py-10">
                  {showProcessDetails ? (
                    <AgentPreparationProgress
                      position={workspace.config.position}
                      activities={workspace.activities}
                      strategy={workspace.strategy}
                      retrying={session.loading}
                      onRetry={() => void session.retryPreparation().catch(() => undefined)}
                    />
                  ) : (
                    <p className="text-center text-sm text-muted-foreground">正在准备真实模拟面试…</p>
                  )}
                </div>
              ) : (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  正在恢复面试内容…
                </div>
              )
            )}
          </div>
        </ScrollArea>

        {!interviewFinished && (
          <footer className="border-t p-4">
            <div className="space-y-2">
              <label htmlFor="agent-answer" className="text-sm font-medium">
                你的回答
              </label>
              <Textarea
                id="agent-answer"
                value={answer.draft}
                onChange={(event) => answer.setDraft(event.target.value)}
                placeholder={
                  canAnswer ? "梳理思路后输入回答，支持多行内容…" : "等待 Agent 完成当前步骤…"
                }
                disabled={!canAnswer || session.loading}
                className="min-h-28 resize-y"
                maxLength={5000}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  草稿已保存在本机 · {answer.draft.length}/5000
                </p>
                <Button
                  className="min-h-11"
                  onClick={() => void submit()}
                  disabled={!canAnswer || !answer.draft.trim() || session.loading}
                >
                  {session.loading ? <Loader2 className="animate-spin" /> : <Send />}提交回答
                </Button>
              </div>
            </div>
          </footer>
        )}
      </section>

      <aside className="space-y-4">
        {showProcessDetails && snapshot.phase !== "preparing" && (
          <AgentActivityPanel strategy={workspace.strategy} activities={workspace.activities} />
        )}
        {workspace.report && (
          <ReportCard
            score={workspace.report.overallScore}
            feedback={workspace.report.overallFeedback}
          />
        )}
        {showProcessDetails && <Card>
          <CardHeader>
            <CardTitle className="text-base">研究上下文</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge variant="outline">{workspace.research.status}</Badge>
            {workspace.research.sources.length === 0 ? (
              <p className="text-xs text-muted-foreground">本场未使用外部研究来源。</p>
            ) : (
              workspace.research.sources.map((source) => (
                <a
                  key={source.id}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-start justify-between gap-2 py-2 text-sm text-primary hover:underline"
                >
                  <span>{source.title}</span>
                  <ExternalLink className="mt-0.5 size-3 shrink-0" />
                </a>
              ))
            )}
          </CardContent>
        </Card>}
        {showProcessDetails && <Card>
          <CardHeader>
            <CardTitle className="text-base">证据与评分</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {workspace.questions.map((question) => (
              <div key={question.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span>第 {question.orderIndex + 1} 题</span>
                  <span>
                    {question.evaluation ? `${question.evaluation.overallScore} 分` : "待评分"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {question.dimensionKey} · {question.evidence.length} 条证据
                </p>
                {question.evidence.slice(0, 2).map((item) => (
                  <blockquote
                    key={item.id}
                    className="mt-2 border-l-2 pl-2 text-xs text-muted-foreground"
                  >
                    “{item.quote}”
                  </blockquote>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>}
        {!session.connected && !completed && (
          <Button variant="outline" className="min-h-11 w-full" onClick={session.reconnect}>
            <RotateCw />
            重连事件流
          </Button>
        )}
      </aside>
    </div>
  );
}
