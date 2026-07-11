/** interview-session - 面试对话消息流 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  evaluateConversation,
  getSession,
  sendMessage,
} from "../api";
import type { Message, QuestionItem } from "../types";

/**
 * 解析 messages
 *
 * @param answer -
 * @returns
 */
function parseMessages(answer: string | null): Message[] {
  if (!answer) return [];
  try {
    const parsed = JSON.parse(answer) as Message[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return answer.trim()
      ? [{ role: "user", content: answer, created_at: new Date().toISOString() }]
      : [];
  }
}

type UseConversationParams = {
  sessionId: string;
  currentIndex: number;
  question: QuestionItem | null;
  onAutoScore: (score: number, feedback: string) => void;
  onRefresh: () => Promise<void>;
};

/**
 * use conversation
 * @returns
 */
export function useConversation({
  sessionId,
  currentIndex,
  question,
  onAutoScore,
  onRefresh,
}: UseConversationParams) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessage("");
    setMessages(parseMessages(question?.answer ?? null));
  }, [currentIndex, question?.id, question?.answer]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * refetch question messages
   * @returns Promise<
   */
  async function refetchQuestionMessages() {
    if (!question) return;
    const refreshed = await getSession(sessionId);
    const refreshedQuestion = refreshed.questions.find((item) => item.id === question.id);
    setMessages(parseMessages(refreshedQuestion?.answer ?? null));
  }

  /**
   * 处理 发送 message
   * @returns Promise<
   */
  async function handleSendMessage() {
    if (!question || !message.trim()) {
      toast.error("请输入你的回答");
      return;
    }

    const text = message.trim();
    setMessage("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-user-${Date.now()}`,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const result = await sendMessage(question.id, text);
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-ai-${Date.now()}`,
          role: "assistant",
          content: result.response,
          created_at: new Date().toISOString(),
        },
      ]);
      if (result.done && result.score != null) {
        onAutoScore(result.score, result.feedback ?? "");
        toast.success("评分完成");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发送失败");
      try {
        await refetchQuestionMessages();
      } catch {
        setMessages([]);
      }
    } finally {
      setSending(false);
    }
  }

  /**
   * 处理 评估
   * @returns Promise<
   */
  async function handleEvaluate() {
    if (!question) return;
    setEvaluating(true);
    try {
      await evaluateConversation(question.id);
      toast.success("评分完成");
      await onRefresh();
      setMessages([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "评分失败");
    } finally {
      setEvaluating(false);
    }
  }

  return {
    message,
    setMessage,
    messages,
    sending,
    evaluating,
    messagesEndRef,
    canConclude: messages.length >= 2 && !evaluating,
    handleSendMessage,
    handleEvaluate,
  };
}

