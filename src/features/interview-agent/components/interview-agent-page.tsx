/**
 * Agent 面试页面：统一管理 Agent 面试会话、角色/阶段/题目进度展示和 SSE 事件驱动 UI。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Mic2, Send, User } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAgentSession } from "../hooks/use-agent-session";
import type { AgentRoleId, AgentSnapshot } from "../types";
import { AGENT_PHASE_DISPLAY, AGENT_ROLE_DISPLAY } from "../types";

/** 消息显示 */
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

/** 面试会话配置摘要 */
type SessionConfigSummary = {
  mode: "single" | "panel";
  position: string;
  difficulty: string;
  questionCount: number;
  targetCompany?: string;
};

/**
 * Agent 面试页面 Props。
 */
export type InterviewAgentPageProps = {
  /** 现有会话 ID（用于从历史记录进入时恢复）。 */
  sessionId?: string;
  /** 面试配置（新会话时需要）。 */
  config?: SessionConfigSummary;
};

/**
 * Agent 面试页面主组件。
 * 支持从零创建会话和从历史恢复会话两种模式。
 */
export function InterviewAgentPage({ sessionId, config }: InterviewAgentPageProps) {
  const router = useRouter();
  const { snapshot, loading, error, connected, create, submitInput, interrupt, reconnect } =
    useAgentSession(sessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [created, setCreated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /** 自动创建新会话 */
  useEffect(() => {
    if (!sessionId && config && !created && !loading) {
      setCreated(true);
      create({
        mode: config.mode,
        interviewMode: "text",
        position: config.position,
        difficulty: config.difficulty,
        questionCount: config.questionCount,
        targetCompany: config.targetCompany,
        webResearch: true,
      }).catch(() => {
        setCreated(false);
      });
    }
  }, [sessionId, config, created, loading, create]);

  /** 快照更新时添加面试官消息 */
  useEffect(() => {
    if (!snapshot || snapshot.phase === "preparing") return;
    // 当 phase 变为 awaiting_answer 且有 currentQuestionId 时，显示问题
    if (snapshot.phase === "awaiting_answer" && snapshot.currentQuestionId && messages.length === 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: `q-${snapshot.currentQuestionId}`,
          role: "assistant",
          content: `【${AGENT_ROLE_DISPLAY[snapshot.currentRole]?.label ?? snapshot.currentRole}】问题 ${(snapshot.currentQuestionIndex ?? 0) + 1}`,
          timestamp: Date.now(),
        },
      ]);
    }
    if (snapshot.phase === "completed") {
      setMessages((prev) => [
        ...prev,
        { id: "completed", role: "assistant", content: "面试已完成！", timestamp: Date.now() },
      ]);
    }
  }, [snapshot?.phase, snapshot?.currentQuestionId, snapshot?.currentRole, snapshot?.currentQuestionIndex]);

  /** 自动滚动到底部 */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** 提交回答 */
  const handleSubmit = useCallback(async () => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue("");
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    try {
      await submitInput(text);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "assistant", content: "提交失败，请重试", timestamp: Date.now() },
      ]);
    }
  }, [inputValue, submitInput]);

  /** 按 Enter 提交 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  /** 角色徽章颜色 */
  const roleColor = (role: AgentRoleId): string => {
    return AGENT_ROLE_DISPLAY[role]?.color ?? "bg-gray-500";
  };

  if (!sessionId && !config) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center text-muted-foreground">
            请提供面试配置或现有会话 ID。
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col">
      {/* 顶部导航栏 */}
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.history.back()}>
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Agent 面试</h1>
            {config && (
              <p className="text-xs text-muted-foreground">
                {config.position} · {config.difficulty} · {config.questionCount} 题
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 连接状态 */}
          <Badge variant={connected ? "default" : "secondary"} className="text-xs">
            {connected ? "已连接" : "已断开"}
          </Badge>
          {!connected && (
            <Button variant="outline" size="sm" onClick={reconnect}>
              重连
            </Button>
          )}
          {/* 当前阶段 */}
          {snapshot && (
            <Badge variant="outline" className="text-xs">
              {AGENT_PHASE_DISPLAY[snapshot.phase] ?? snapshot.phase}
            </Badge>
          )}
          {/* 当前角色 */}
          {snapshot && snapshot.currentRole && (
            <Badge className={`text-xs ${roleColor(snapshot.currentRole)} text-white`}>
              {AGENT_ROLE_DISPLAY[snapshot.currentRole]?.label ?? snapshot.currentRole}
            </Badge>
          )}
        </div>
      </header>

      {/* 进度指示器 */}
      {snapshot && (
        <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
          <span>题目进度：{snapshot.currentQuestionIndex + 1} / {config?.questionCount ?? "?"}</span>
          <span>·</span>
          <span>追问：{snapshot.followUpCount}/3</span>
          <span>·</span>
          <span>事件：#{snapshot.eventCursor}</span>
          {loading && <Loader2 className="size-3 animate-spin" />}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>
      )}

      {/* 消息列表 */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-4">
          {messages.length === 0 && snapshot?.phase === "preparing" && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" />
              Agent 正在准备面试...
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                <div className="mt-1 text-right text-[10px] opacity-60">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* 输入区域 */}
      <div className="border-t px-4 py-3">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              snapshot?.phase === "awaiting_answer"
                ? "输入你的回答..."
                : snapshot?.phase === "completed"
                  ? "面试已结束"
                  : "等待面试官提问..."
            }
            disabled={loading || snapshot?.phase === "completed" || snapshot?.phase === "preparing"}
            className="min-h-11 flex-1"
          />
          <Button
            onClick={handleSubmit}
            disabled={loading || !inputValue.trim() || snapshot?.phase !== "awaiting_answer"}
            className="min-h-11"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export { type ChatMessage, type SessionConfigSummary };
