/** voice-interview - 语音面试页面 */
import { BriefcaseBusiness, Loader2, Mic2, ShieldCheck, Square } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CompletedSession } from "@/features/interview-session/components/completed-session";
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
    return <CompletedSession session={voiceSession.session} questions={voiceSession.questions} />;
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-voice-border bg-voice-background text-voice-foreground shadow-2xl">
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-voice-accent/10" />
        <header className="relative border-b border-voice-border px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-voice-accent">
                <Mic2 className="h-3.5 w-3.5" />
                Live interview
              </div>
              <div className="mt-2 flex min-w-0 items-center gap-2">
                <BriefcaseBusiness className="h-4 w-4 shrink-0 text-voice-muted" />
                <h1 className="truncate text-base font-semibold text-voice-foreground sm:text-lg">
                  {voiceSession.session.position}
                </h1>
                <span className="shrink-0 rounded-full border border-voice-border bg-voice-surface px-2 py-0.5 text-xs text-voice-muted">
                  {voiceSession.session.difficulty}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Progress
                  value={voiceSession.progress}
                  className="h-1.5 w-32 bg-voice-surface-strong sm:w-48 [&>div]:bg-voice-accent"
                />
                <span className="text-xs text-voice-muted">
                  已完成 {voiceSession.answeredCount} / {voiceSession.questions.length} 轮
                </span>
              </div>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={voiceSession.finishing}
                  className="min-h-11 shrink-0 text-voice-muted hover:bg-destructive/10 hover:text-destructive"
                >
                  {voiceSession.finishing ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="mr-1 h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">结束面试</span>
                  <span className="sm:hidden">结束</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle>确认提前结束语音面试？</AlertDialogTitle>
                  <AlertDialogDescription>
                    当前回答将停止，系统会根据已经完成的轮次生成结果。此操作无法撤销。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>继续面试</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void voiceSession.completeInterview()}
                  >
                    确认结束
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </header>

        <main className="relative px-3 py-4 pb-24 sm:px-6 sm:py-6">
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
        </main>

        <footer className="relative flex items-center justify-center gap-2 border-t border-voice-border px-4 py-3 text-xs text-voice-muted">
          <ShieldCheck className="h-3.5 w-3.5" />
          面试音频仅用于本次实时识别与评估
        </footer>
      </div>
    </div>
  );
}
