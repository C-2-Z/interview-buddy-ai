import { Loader2, Mic2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CompletedSession } from "@/features/interview-session/components/completed-session";
import { SessionProgress } from "@/features/interview-session/components/session-progress";
import { VoiceInterviewPanel } from "./voice-interview-panel";
import { useVoiceSession } from "../hooks/use-voice-session";

export function VoiceSessionPage({ sessionId }: { sessionId: string }) {
  const voiceSession = useVoiceSession(sessionId);

  if (!voiceSession.session) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (voiceSession.isComplete) {
    return (
      <CompletedSession
        session={voiceSession.session}
        questions={voiceSession.questions}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SessionProgress
        session={voiceSession.session}
        progress={voiceSession.progress}
        answeredCount={voiceSession.answeredCount}
        total={voiceSession.questions.length}
      />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Mic2 className="h-5 w-5" />
                实时语音面试
              </CardTitle>
              <CardDescription>
                AI 面试官会读题、追问并自动进入下一题；题目不会作为卡片提前展示。
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={voiceSession.finishing}
              onClick={() => void voiceSession.completeInterview()}
            >
              {voiceSession.finishing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Square className="mr-1 h-4 w-4" />
              )}
              结束面试
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <VoiceInterviewPanel
            sessionId={sessionId}
            initialQuestionId={voiceSession.currentQuestion?.id ?? null}
            initialQuestionIndex={voiceSession.currentQuestionIndex}
            totalQuestions={voiceSession.questions.length}
            completed={voiceSession.isComplete}
            onQuestionScored={voiceSession.updateQuestionScore}
            onSessionCompleted={voiceSession.applyCompletion}
            onRefresh={voiceSession.refresh}
          />
        </CardContent>
      </Card>
    </div>
  );
}
