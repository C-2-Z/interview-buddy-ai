/** immersive-voice-interview：组合 Agent workspace、事件流和语音通道。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentSession } from "@/features/interview-agent/hooks/use-agent-session";
import {
  useAgentVoice,
  type AgentVoiceEvent,
} from "@/features/interview-agent/hooks/use-agent-voice";
import type { ImmersiveVoiceState, VoiceCaptionView, VoiceRecoveryIssue } from "../types";
import { reduceVoiceExperienceState, type VoiceExperienceSignal } from "./voice-experience-state";

/** 管理单个 voice Agent 会话的自动播报、收音、恢复与字幕状态。 */
export function useImmersiveVoiceSession(sessionId: string) {
  const session = useAgentSession(sessionId);
  const refreshSession = session.refresh;
  const reconnectSession = session.reconnect;
  const [state, setState] = useState<ImmersiveVoiceState>("connecting");
  const [caption, setCaption] = useState<VoiceCaptionView | null>(null);
  const [issue, setIssue] = useState<VoiceRecoveryIssue | null>(null);
  const [listenRequest, setListenRequest] = useState(0);
  const completedRef = useRef(false);
  const connectedOnceRef = useRef(false);
  const connectStartedRef = useRef(false);
  const pausedRef = useRef(false);
  const lastListenTurnRef = useRef<string | null>(null);
  const startRef = useRef<() => Promise<void>>(async () => undefined);

  /** 应用一个可测试状态信号。 */
  const transition = useCallback((signal: VoiceExperienceSignal) => {
    setState((current) => reduceVoiceExperienceState(current, signal));
  }, []);

  /** 在一次 TTS 结束后安排自动聆听，并避免 prompt_end 重复触发。 */
  const requestListening = useCallback(
    (turnId: string) => {
      if (completedRef.current || pausedRef.current || lastListenTurnRef.current === turnId) return;
      lastListenTurnRef.current = turnId;
      transition("listen");
      setListenRequest((current) => current + 1);
    },
    [transition],
  );

  /** 将结构化语音事件映射为沉浸状态、字幕和恢复动作。 */
  const handleVoiceEvent = useCallback(
    (event: AgentVoiceEvent) => {
      if (event.type === "interviewer_prompt_start") {
        transition("interviewer_audio");
        setCaption({ speaker: "interviewer", text: event.text, partial: false });
      } else if (event.type === "assistant_text") {
        setCaption({ speaker: "interviewer", text: event.text, partial: false });
      } else if (event.type === "assistant_audio_start") {
        transition("interviewer_audio");
      } else if (event.type === "assistant_audio_end" || event.type === "interviewer_prompt_end") {
        requestListening(event.turnId);
      } else if (event.type === "transcript_partial") {
        setCaption({ speaker: "candidate", text: event.text, partial: true });
      } else if (event.type === "transcript_final") {
        transition("transcript_final");
        setCaption({ speaker: "candidate", text: event.text, partial: false });
      } else if (event.type === "voice_stage" && event.stage === "agent_reasoning") {
        transition("transcript_final");
      } else if (event.type === "session_completed") {
        completedRef.current = true;
        transition("complete");
        setCaption({ speaker: "system", text: "面试已完成，正在生成复盘报告。", partial: false });
        void refreshSession();
      } else if (event.type === "error") {
        transition("failed");
        setIssue({
          code: event.code ?? "voice_server_error",
          stage: event.stage ?? "voice",
          message: event.message,
          retryable: event.retryable ?? true,
        });
      }

      if (
        ["transcript_final", "question_scored", "next_question", "session_completed"].includes(
          event.type,
        )
      ) {
        void refreshSession();
      }
    },
    [refreshSession, requestListening, transition],
  );

  const voice = useAgentVoice({
    sessionId,
    questionId: session.snapshot?.currentQuestionId ?? null,
    onEvent: handleVoiceEvent,
    autoStopOnSilence: true,
  });
  const connectVoice = voice.connect;
  const disposeVoice = voice.dispose;
  const interruptVoice = voice.interrupt;
  const startVoice = voice.start;
  const stopVoice = voice.stop;
  startRef.current = startVoice;

  useEffect(() => {
    if (
      !session.snapshot ||
      connectStartedRef.current ||
      session.snapshot.interviewMode !== "voice" ||
      session.snapshot.phase === "completed"
    )
      return;
    connectStartedRef.current = true;
    transition("connect");
    void connectVoice();
  }, [connectVoice, session.snapshot, transition]);

  useEffect(() => {
    if (!listenRequest || pausedRef.current || completedRef.current) return;
    const timer = window.setTimeout(() => void startRef.current(), 180);
    return () => window.clearTimeout(timer);
  }, [listenRequest]);

  useEffect(() => {
    if (voice.connected) {
      connectedOnceRef.current = true;
      if (state === "connecting" || state === "reconnecting") transition("connected");
    } else if (
      connectedOnceRef.current &&
      !voice.connecting &&
      !completedRef.current &&
      !pausedRef.current
    ) {
      transition("connection_lost");
    }
  }, [state, transition, voice.connected, voice.connecting]);

  useEffect(() => {
    if (!voice.error) return;
    transition("failed");
    setIssue({
      code: voice.error.code,
      stage: "browser",
      message: voice.error.message,
      retryable: true,
    });
  }, [transition, voice.error]);

  useEffect(() => {
    if (session.snapshot?.phase !== "completed" || completedRef.current) return;
    completedRef.current = true;
    transition("complete");
  }, [session.snapshot?.phase, transition]);

  /** 暂停本地收音和播报，不推进 Agent 状态。 */
  const pause = useCallback(async () => {
    pausedRef.current = true;
    if (voice.recording) await stopVoice();
    if (voice.speaking) interruptVoice();
    transition("pause");
  }, [interruptVoice, stopVoice, transition, voice.recording, voice.speaking]);

  /** 恢复当前题目的聆听；连接断开时先申请新的一次性令牌。 */
  const resume = useCallback(async () => {
    pausedRef.current = false;
    setIssue(null);
    transition("resume");
    if (!voice.connected) await connectVoice();
    setListenRequest((current) => current + 1);
  }, [connectVoice, transition, voice.connected]);

  /** 重新加载 workspace、SSE 并重建语音 WebSocket。 */
  const retry = useCallback(async () => {
    setIssue(null);
    transition("connect");
    await refreshSession().catch(() => undefined);
    reconnectSession();
    await connectVoice();
  }, [connectVoice, reconnectSession, refreshSession, transition]);

  /** 用户主动开始回答时先打断 TTS，再启动本轮稳定 turnId 收音。 */
  const startAnswer = useCallback(async () => {
    if (voice.speaking) interruptVoice();
    pausedRef.current = false;
    transition("listen");
    await startVoice();
  }, [interruptVoice, startVoice, transition, voice.speaking]);

  return {
    state,
    caption,
    issue,
    workspace: session.workspace,
    snapshot: session.snapshot,
    loading: session.loading,
    sessionError: session.error,
    connected: voice.connected,
    recording: voice.recording,
    speaking: voice.speaking,
    stage: voice.stage,
    pause,
    resume,
    retry,
    startAnswer,
    interrupt: interruptVoice,
    dispose: disposeVoice,
  };
}
