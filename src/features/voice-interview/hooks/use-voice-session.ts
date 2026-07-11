/** voice-interview - 会话状态 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { QuestionItem, SessionDetail } from "@/features/interview-session/types";
import { endVoiceSession, getVoiceSession } from "../api";

export function useVoiceSession(sessionId: string) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [finishing, setFinishing] = useState(false);

  const refresh = useCallback(async () => {
    const result = await getVoiceSession(sessionId);
    setSession(result.session);
    setQuestions(result.questions);
  }, [sessionId]);

  useEffect(() => {
    refresh().catch(() => toast.error("加载语音面试失败"));
  }, [refresh]);

  const currentQuestion =
    questions.find((question) => question.score == null) ??
    questions[questions.length - 1] ??
    null;
  const currentQuestionIndex = currentQuestion
    ? Math.max(0, currentQuestion.order_index)
    : 0;
  const isComplete = session?.status === "completed";
  const answeredCount = questions.filter((question) => question.score != null).length;
  const progress = questions.length ? (answeredCount / questions.length) * 100 : 0;

  function updateQuestionScore(
    questionId: string,
    score: number,
    feedback: string,
  ) {
    setQuestions((prev) =>
      prev.map((question) =>
        question.id === questionId ? { ...question, score, feedback } : question,
      ),
    );
  }

  function applyCompletion(result: {
    overallScore: number;
    overallFeedback: string;
  }) {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            status: "completed",
            overall_score: result.overallScore,
            overall_feedback: result.overallFeedback,
          }
        : prev,
    );
  }

  async function completeInterview() {
    setFinishing(true);
    try {
      const result = await endVoiceSession(sessionId);
      applyCompletion(result);
      await refresh();
      toast.success("语音面试已完成");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "完成语音面试失败");
    } finally {
      setFinishing(false);
    }
  }

  return {
    session,
    questions,
    currentQuestion,
    currentQuestionIndex,
    isComplete,
    answeredCount,
    progress,
    finishing,
    refresh,
    updateQuestionScore,
    applyCompletion,
    completeInterview,
  };
}
