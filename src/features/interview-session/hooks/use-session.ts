import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  finishSession,
  getSession,
} from "../api";
import type { QuestionItem, SessionDetail } from "../types";

export function useSession(sessionId: string) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const refresh = useCallback(async () => {
    const result = await getSession(sessionId);
    setSession(result.session);
    setQuestions(result.questions);
    const firstUnanswered = result.questions.findIndex((q) => q.score == null);
    setCurrent(
      firstUnanswered >= 0
        ? firstUnanswered
        : Math.max(0, result.questions.length - 1),
    );
  }, [sessionId]);

  useEffect(() => {
    refresh().catch(() => toast.error("加载面试失败"));
  }, [refresh]);

  const currentQuestion = questions[current] ?? null;
  const isComplete = session?.status === "completed";
  const allAnswered =
    questions.length > 0 && questions.every((question) => question.score != null);
  const answeredCount = questions.filter((question) => question.score != null).length;
  const progress = questions.length ? (answeredCount / questions.length) * 100 : 0;

  function nextQuestion() {
    if (current < questions.length - 1) {
      setCurrent(current + 1);
    }
  }

  function updateCurrentQuestionScore(score: number, feedback: string) {
    setQuestions((prev) =>
      prev.map((question, index) =>
        index === current ? { ...question, score, feedback } : question,
      ),
    );
  }

  async function completeInterview() {
    setFinishing(true);
    try {
      await finishSession(sessionId);
      await refresh();
      toast.success("面试已完成");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "完成失败");
    } finally {
      setFinishing(false);
    }
  }

  return {
    session,
    questions,
    setQuestions,
    current,
    setCurrent,
    currentQuestion,
    isComplete,
    allAnswered,
    answeredCount,
    progress,
    finishing,
    refresh,
    nextQuestion,
    updateCurrentQuestionScore,
    completeInterview,
  };
}

