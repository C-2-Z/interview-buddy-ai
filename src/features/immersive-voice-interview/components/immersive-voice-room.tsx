/** immersive-voice-interview：无 AppShell 的全窗口语音面试房间。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { VOICE_STATE_LABELS } from "../constants";
import { useFullscreenSession } from "../hooks/use-fullscreen-session";
import { useImmersiveVoiceSession } from "../hooks/use-immersive-voice-session";
import { useScreenWakeLock } from "../hooks/use-screen-wake-lock";
import { VoiceCaption } from "./voice-caption";
import { VoiceEmergencyControls } from "./voice-emergency-controls";
import { VoicePresenceOrb } from "./voice-presence-orb";
import { VoiceRecoveryAlert } from "./voice-recovery-alert";

/** 房间页面属性。 */
export type ImmersiveVoiceRoomProps = Readonly<{
  /** 已创建的 voice Agent 会话 UUID。 */
  sessionId: string;
}>;

/** 沉浸式语音房间。 */
export function ImmersiveVoiceRoom({ sessionId }: ImmersiveVoiceRoomProps) {
  const navigate = useNavigate();
  const voice = useImmersiveVoiceSession(sessionId);
  const fullscreen = useFullscreenSession();
  const disposeVoice = voice.dispose;
  const exitFullscreen = fullscreen.exit;
  useScreenWakeLock(voice.state !== "completed");
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const completionHandledRef = useRef(false);

  /** 用户活动时显示安全控制，并在稳定状态后再次弱化。 */
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (voice.state !== "paused" && voice.state !== "recovery_required") {
      hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 4_000);
    }
  }, [voice.state]);

  useEffect(() => {
    revealControls();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [revealControls]);

  useEffect(() => {
    if (!voice.snapshot || voice.snapshot.interviewMode === "voice") return;
    void navigate({ to: "/session/$id", params: { id: sessionId }, replace: true });
  }, [navigate, sessionId, voice.snapshot]);

  useEffect(() => {
    if (voice.state !== "completed" || completionHandledRef.current) return;
    completionHandledRef.current = true;
    let active = true;
    void Promise.allSettled([disposeVoice(), exitFullscreen()]).then(() => {
      if (active) void navigate({ to: "/session/$id", params: { id: sessionId }, replace: true });
    });
    return () => {
      active = false;
    };
  }, [disposeVoice, exitFullscreen, navigate, sessionId, voice.state]);

  /** 释放所有媒体资源并返回双入口首页。 */
  async function exitRoom() {
    await Promise.allSettled([disposeVoice(), exitFullscreen()]);
    await navigate({ to: "/interview-hub", replace: true });
  }

  /** 使用同一 Agent Graph 降级到文字输入，不启用旧面试状态机。 */
  async function switchToText() {
    await Promise.allSettled([disposeVoice(), exitFullscreen()]);
    await navigate({
      to: "/session/$id",
      params: { id: sessionId },
      search: { fallback: "text" },
      replace: true,
    });
  }

  if (voice.loading && !voice.workspace) {
    return (
      <main
        className="flex min-h-dvh items-center justify-center bg-voice-background text-voice-foreground"
        aria-live="polite"
      >
        <Loader2 className="size-8 animate-spin" />
        <span className="sr-only">正在恢复语音面试</span>
      </main>
    );
  }

  const issue =
    voice.issue ??
    (voice.sessionError
      ? {
          code: "voice_workspace_failed",
          stage: "session",
          message: voice.sessionError,
          retryable: true,
        }
      : null);
  const forcedControls =
    voice.state === "paused" || voice.state === "recovery_required" || Boolean(issue);

  return (
    <main
      className="relative flex min-h-dvh select-none flex-col overflow-hidden bg-voice-background text-voice-foreground"
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      onKeyDown={revealControls}
      onFocusCapture={revealControls}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--color-voice-accent)_12%,transparent),transparent_42%)]" />
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 pb-36 pt-10 sm:px-8">
        <p className="text-sm font-medium text-voice-muted" aria-hidden="true">
          {voice.workspace?.config.position ?? "语音面试"}
        </p>
        <div className="mt-8 flex flex-1 flex-col items-center justify-center">
          <VoicePresenceOrb state={voice.state} />
          <h1 className="mt-10 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            {VOICE_STATE_LABELS[voice.state]}
          </h1>
          <p className="mt-3 min-h-6 text-center text-sm text-voice-muted">
            {voice.recording ? "自然回答即可，停顿后系统会自动继续" : voice.stage}
          </p>
          <VoiceCaption caption={voice.caption} visible={captionsVisible} />
        </div>
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {VOICE_STATE_LABELS[voice.state]}。{voice.stage}
      </div>
      {issue && (
        <VoiceRecoveryAlert
          issue={issue}
          onRetry={() => void voice.retry()}
          onSwitchToText={() => void switchToText()}
          onExit={() => void exitRoom()}
        />
      )}

      <div
        className={`fixed inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] transition-opacity duration-200 ${controlsVisible || forcedControls ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <VoiceEmergencyControls
          paused={voice.state === "paused"}
          captionsVisible={captionsVisible}
          fullscreen={fullscreen.active}
          recording={voice.recording}
          canStartAnswer={voice.speaking}
          onPause={() => void voice.pause()}
          onResume={() => void voice.resume()}
          onToggleCaptions={() => setCaptionsVisible((current) => !current)}
          onFullscreen={() => void fullscreen.request()}
          onStartAnswer={() => void voice.startAnswer()}
          onExit={() => void exitRoom()}
        />
      </div>
    </main>
  );
}
