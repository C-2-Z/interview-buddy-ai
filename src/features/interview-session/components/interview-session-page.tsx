import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChatPanel } from "./chat-panel";
import { CompletedSession } from "./completed-session";
import { QuestionNav } from "./question-nav";
import { QuestionResult } from "./question-result";
import { SessionProgress } from "./session-progress";
import { useConversation } from "../hooks/use-conversation";
import { useSession } from "../hooks/use-session";
import { VoiceInterviewPanel } from "@/features/voice-interview/components/voice-interview-panel";

export function InterviewSessionPage({ sessionId }: { sessionId: string }) {
  const [voiceMode, setVoiceMode] = useState(false);
  const sessionState = useSession(sessionId);
  const conversation = useConversation({
    sessionId,
    currentIndex: sessionState.current,
    question: sessionState.currentQuestion,
    onAutoScore: sessionState.updateCurrentQuestionScore,
    onRefresh: sessionState.refresh,
  });

  if (!sessionState.session) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (sessionState.isComplete) {
    return (
      <CompletedSession
        session={sessionState.session}
        questions={sessionState.questions}
      />
    );
  }

  const question = sessionState.currentQuestion;

  return (
    <div className="space-y-4">
      <SessionProgress
        session={sessionState.session}
        progress={sessionState.progress}
        answeredCount={sessionState.answeredCount}
        total={sessionState.questions.length}
      />
      <QuestionNav
        questions={sessionState.questions}
        current={sessionState.current}
        onChange={sessionState.setCurrent}
      />

      {question && (
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <Badge variant="outline" className="w-fit">
              第 {sessionState.current + 1} 题
            </Badge>
            <CardTitle className="text-lg leading-relaxed">
              {question.question}
            </CardTitle>
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
              <div className="space-y-4">
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant={!voiceMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => setVoiceMode(false)}
                  >
                    文字面试
                  </Button>
                  <Button
                    type="button"
                    variant={voiceMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => setVoiceMode(true)}
                  >
                    语音面试
                  </Button>
                </div>
                {voiceMode ? (
                  <VoiceInterviewPanel
                    sessionId={sessionId}
                    question={question}
                    onAutoScore={sessionState.updateCurrentQuestionScore}
                    onRefresh={sessionState.refresh}
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
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

