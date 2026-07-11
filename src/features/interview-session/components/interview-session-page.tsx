/** interview-session - 面试对话页面 */
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatPanel } from "./chat-panel";
import { CompletedSession } from "./completed-session";
import { QuestionNav } from "./question-nav";
import { QuestionResult } from "./question-result";
import { SessionProgress } from "./session-progress";
import { useConversation } from "../hooks/use-conversation";
import { useSession } from "../hooks/use-session";

export function InterviewSessionPage({ sessionId }: { sessionId: string }) {
  const sessionState = useSession(sessionId);
  const conversation = useConversation({
    sessionId,
    currentIndex: sessionState.current,
    question: sessionState.currentQuestion,
    onAutoScore: sessionState.updateCurrentQuestionScore,
    onRefresh: sessionState.refresh,
  });

  // Auto-complete interview when all questions are scored
  useEffect(() => {
    if (
      sessionState.allAnswered &&
      sessionState.session?.status === "in_progress" &&
      !sessionState.finishing
    ) {
      sessionState.completeInterview();
    }
  }, [sessionState.allAnswered, sessionState.session?.status, sessionState.finishing]);

  if (!sessionState.session) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (sessionState.isComplete) {
    return <CompletedSession session={sessionState.session} questions={sessionState.questions} />;
  }

  const question = sessionState.currentQuestion;

  return (
    <div className="space-y-5">
      <SessionProgress
        session={sessionState.session}
        progress={sessionState.progress}
        answeredCount={sessionState.answeredCount}
        total={sessionState.questions.length}
      />
      <details className="rounded-2xl border bg-card p-4 lg:hidden">
        <summary className="cursor-pointer font-medium">查看题目进度</summary>
        <div className="mt-4 border-t pt-4">
          <QuestionNav
            questions={sessionState.questions}
            current={sessionState.current}
            onChange={sessionState.setCurrent}
          />
        </div>
      </details>

      {question && (
        <div className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="sticky top-8 hidden rounded-2xl border bg-card p-4 lg:block">
            <div className="mb-3 text-sm font-semibold">题目进度</div>
            <QuestionNav
              questions={sessionState.questions}
              current={sessionState.current}
              onChange={sessionState.setCurrent}
            />
          </aside>
          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <Badge variant="outline" className="w-fit">
                第 {sessionState.current + 1} 题
              </Badge>
              <CardTitle className="text-lg leading-8 sm:text-xl">{question.question}</CardTitle>
            </CardHeader>
            <CardContent>
              {question.score != null ? (
                <QuestionResult
                  question={question}
                  messages={conversation.messages}
                  canGoNext={sessionState.current < sessionState.questions.length - 1}
                  allAnswered={sessionState.allAnswered}
                  finishing={sessionState.finishing}
                  onNext={sessionState.nextQuestion}
                  onFinish={sessionState.completeInterview}
                />
              ) : (
                <ChatPanel
                  message={conversation.message}
                  messages={conversation.messages}
                  sending={conversation.sending}
                  evaluating={conversation.evaluating}
                  canConclude={conversation.canConclude}
                  endRef={conversation.messagesEndRef}
                  onMessageChange={conversation.setMessage}
                  onSend={conversation.handleSendMessage}
                  onEvaluate={conversation.handleEvaluate}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
