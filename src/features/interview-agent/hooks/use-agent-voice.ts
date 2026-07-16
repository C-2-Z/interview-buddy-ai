/** Agent 语音 Hook：浏览器 PCM 采集、静音收口、Agent WebSocket、流式播放与打断。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { connectAgentVoice } from "../api";
import { platformAdapter } from "@/shared/platform/platform-adapter";
import { resolveWebSocketUrl, runtimeConfig } from "@/shared/runtime/runtime-config";
import { nextVoiceReconnectDelay } from "./voice-reconnect-policy";

/** 语音线路事件的统一版本与有序元数据。 */
type VoiceWireMetadata = {
  /** 协议主版本。 */ protocolVersion: 1;
  /** 连接内唯一事件 ID。 */ eventId: string;
  /** 连接内严格递增序号。 */ sequence: number;
};

/** 后端语音事件的页面所需子集。 */
export type AgentVoiceEvent = VoiceWireMetadata & (
  | { type: "ready" | "assistant_text_done" | "generation_cancelled"; turnId?: string }
  | {
      type: "session_ready";
      sessionId: string;
      questionId: string | null;
      currentQuestionIndex: number;
      totalQuestions: number;
    }
  | { type: "voice_stage"; stage: string; message: string; turnId?: string }
  | {
      type: "error";
      message: string;
      code?: string;
      stage?: string;
      retryable?: boolean;
      turnId?: string;
    }
  | {
      type: "transcript_partial" | "transcript_final" | "assistant_text";
      text: string;
      turnId: string;
    }
  | { type: "assistant_audio_start"; turnId: string; sampleRate: number }
  | { type: "assistant_audio_end" | "interrupted"; turnId: string }
  | {
      type: "interviewer_prompt_start";
      turnId: string;
      questionId: string;
      text: string;
      currentQuestionIndex: number;
      totalQuestions: number;
    }
  | { type: "interviewer_prompt_end"; turnId: string; questionId: string }
  | {
      type: "next_question";
      questionId: string;
      currentQuestionIndex: number;
      totalQuestions: number;
    }
  | { type: "question_scored"; questionId: string; score: number; feedback: string }
  | { type: "session_completed"; overallScore: number; overallFeedback: string }
  | { type: "connection_state"; state: "connected" | "resumed" | "closing" }
  | { type: "resume_snapshot"; sessionId: string; questionId: string | null; currentQuestionIndex: number; totalQuestions: number }
  | { type: "rate_limited"; code: string; message: string; turnId?: string }
  | { type: "turn_rejected"; code: string; message: string; turnId: string }
);

/** Hook 输入。 */
export type UseAgentVoiceInput = {
  /** voice 模式会话 UUID。 */ sessionId: string;
  /** 当前题目 UUID。 */ questionId: string | null;
  /** 结构化事件回调。 */ onEvent(event: AgentVoiceEvent): void;
  /** 检测到用户说完后是否自动提交音频。 */ autoStopOnSilence?: boolean;
};

/** Hook 对沉浸房间暴露的安全错误。 */
export type AgentVoiceClientError = Readonly<{
  /** 稳定客户端错误码。 */ code: string;
  /** 用户可执行的说明。 */ message: string;
}>;

/** 将浏览器 Float32 PCM 重采样为 16 kHz Int16。 */
function encodePcm16(input: Float32Array, inputRate: number): ArrayBuffer {
  const ratio = inputRate / 16_000;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let cursor = start; cursor < end; cursor += 1) sum += input[cursor];
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output.buffer;
}

/** 管理单个语音 Agent 连接。 */
export function useAgentVoice({
  sessionId,
  questionId,
  onEvent,
  autoStopOnSilence = false,
}: UseAgentVoiceInput) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [stage, setStage] = useState("语音尚未连接");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<AgentVoiceClientError | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const captureContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const turnRef = useRef<string | null>(null);
  const preservedTurnRef = useRef<string | null>(null);
  const endingRef = useRef(false);
  const outputTurnRef = useRef<string | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlaybackRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const sampleRateRef = useRef(24_000);
  const stopRef = useRef<() => Promise<void>>(async () => undefined);
  const playbackTimersRef = useRef(new Set<number>());
  const clientSequenceRef = useRef(0);
  const lastServerSequenceRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const connectRef = useRef<() => Promise<void>>(async () => undefined);

  /** 发送带版本、唯一 ID 和有序序号的控制事件。 */
  const sendControl = useCallback((event: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    clientSequenceRef.current += 1;
    socket.send(JSON.stringify({
      ...event,
      protocolVersion: 1,
      eventId: crypto.randomUUID(),
      sequence: clientSequenceRef.current,
    }));
    return true;
  }, []);

  /** 停止并清空所有尚未播放的 TTS。 */
  const stopPlayback = useCallback(() => {
    for (const source of sourcesRef.current) {
      try {
        source.stop();
      } catch {
        // 已自然结束的 source 再次 stop 会抛错，清理仍可继续。
      }
    }
    sourcesRef.current.clear();
    nextPlaybackRef.current = 0;
    setSpeaking(false);
  }, []);

  /** 释放采集资源，可选择提交 audio_end 或为断线重试保留 turnId。 */
  const releaseCapture = useCallback(async (sendEnd: boolean, preserveTurn: boolean) => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    for (const track of mediaRef.current?.getTracks() ?? []) track.stop();
    mediaRef.current = null;
    await captureContextRef.current?.close().catch(() => undefined);
    captureContextRef.current = null;
    const turnId = turnRef.current;
    if (preserveTurn && turnId) preservedTurnRef.current = turnId;
    if (sendEnd && turnId && socketRef.current?.readyState === WebSocket.OPEN) {
      sendControl({ type: "audio_end", turnId });
      preservedTurnRef.current = null;
    }
    turnRef.current = null;
    endingRef.current = false;
    setRecording(false);
  }, [sendControl]);

  /** 结束采集并要求 ASR 返回 final。 */
  const stop = useCallback(async () => {
    if (!recording || (endingRef.current && !processorRef.current)) return;
    endingRef.current = true;
    await releaseCapture(true, false);
    setStage("正在识别并恢复 Agent");
  }, [recording, releaseCapture]);
  stopRef.current = stop;

  /** 调度一个 Int16 PCM 块，保持服务端顺序且无块间重叠。 */
  const playChunk = useCallback(async (data: ArrayBuffer) => {
    try {
      const context = playbackContextRef.current ?? platformAdapter.voice.createAudioContext();
      playbackContextRef.current = context;
      await context.resume();
      const samples = new Int16Array(data);
      const buffer = context.createBuffer(1, samples.length, sampleRateRef.current);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1)
        channel[index] = samples[index] / 32768;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      const start = Math.max(context.currentTime, nextPlaybackRef.current);
      nextPlaybackRef.current = start + buffer.duration;
      sourcesRef.current.add(source);
      source.onended = () => sourcesRef.current.delete(source);
      source.start(start);
    } catch {
      setError({
        code: "voice_audio_playback_blocked",
        message: "浏览器暂时无法播放面试官语音，请点击重试或切换文字模式。",
      });
    }
  }, []);

  /** 连接一次性短期鉴权 WebSocket；重连会申请新令牌。 */
  const connect = useCallback(async () => {
    if (
      socketRef.current?.readyState === WebSocket.OPEN ||
      socketRef.current?.readyState === WebSocket.CONNECTING
    )
      return;
    setConnecting(true);
    setError(null);
    setStage("正在连接语音服务");
    try {
      const { wsUrl } = await connectAgentVoice(sessionId);
      const socket = platformAdapter.createWebSocket(
        resolveWebSocketUrl(runtimeConfig, wsUrl, platformAdapter.getCurrentOrigin() || undefined),
      );
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      socket.onopen = () => {
        const resumeFromSequence = lastServerSequenceRef.current;
        const reconnecting = reconnectAttemptRef.current > 0 || resumeFromSequence > 0;
        // 每条新 WebSocket 的服务端序号从 1 开始，旧水位只用于 resume 请求。
        lastServerSequenceRef.current = 0;
        reconnectAttemptRef.current = 0;
        setConnected(true);
        setConnecting(false);
        setStage("语音服务已连接");
        sendControl(reconnecting
          ? { type: "resume_session", sessionId, lastServerSequence: resumeFromSequence }
          : { type: "hello", sessionId });
        heartbeatTimerRef.current = window.setInterval(() => {
          sendControl({ type: "heartbeat" });
        }, 10_000);
      };
      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        if (heartbeatTimerRef.current !== null) window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
        setConnected(false);
        setConnecting(false);
        if (turnRef.current) void releaseCapture(false, true);
        if (disposedRef.current) return;
        const delay = nextVoiceReconnectDelay(reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;
        setStage(`语音连接已断开，${Math.ceil(delay / 1_000)} 秒后自动重连`);
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          void connectRef.current();
        }, delay);
      };
      socket.onerror = () => {
        setError({ code: "voice_socket_failed", message: "语音连接异常，请检查网络后重试。" });
        setStage("语音连接异常");
      };
      socket.onmessage = (message) => {
        if (message.data instanceof ArrayBuffer) {
          void playChunk(message.data);
          return;
        }
        try {
          const event = JSON.parse(String(message.data)) as AgentVoiceEvent;
          if (
            event.protocolVersion !== 1 ||
            !Number.isSafeInteger(event.sequence) ||
            event.sequence <= lastServerSequenceRef.current
          ) return;
          lastServerSequenceRef.current = event.sequence;
          // Provider 已发完 PCM 不代表浏览器已播放完；结束类事件等本地队列清空后再驱动自动收音。
          if (event.type === "assistant_audio_end" || event.type === "interviewer_prompt_end") {
            const context = playbackContextRef.current;
            const delayMs = context
              ? Math.max(0, (nextPlaybackRef.current - context.currentTime) * 1_000)
              : 0;
            const timer = window.setTimeout(() => {
              playbackTimersRef.current.delete(timer);
              if (event.type === "assistant_audio_end") {
                outputTurnRef.current = null;
                setSpeaking(false);
                sendControl({ type: "playback_completed", turnId: event.turnId });
              }
              onEvent(event);
            }, delayMs);
            playbackTimersRef.current.add(timer);
            return;
          }
          onEvent(event);
          if (event.type === "voice_stage") setStage(event.message);
          if (event.type === "error") {
            setStage(event.message);
            setError({ code: event.code ?? "voice_server_error", message: event.message });
          }
          if (event.type === "transcript_partial") setPartial(event.text);
          if (event.type === "transcript_final") setPartial("");
          if (event.type === "assistant_audio_start") {
            sampleRateRef.current = event.sampleRate;
            outputTurnRef.current = event.turnId;
            setSpeaking(true);
          }
          if (event.type === "interrupted") {
            outputTurnRef.current = null;
            setSpeaking(false);
            stopPlayback();
          }
        } catch {
          setError({
            code: "voice_event_invalid",
            message: "收到无法识别的语音状态，请重新连接。",
          });
          setStage("收到无法解析的语音事件");
        }
      };
    } catch {
      setConnecting(false);
      setConnected(false);
      setError({
        code: "voice_connect_failed",
        message: "无法建立语音连接，请重试或切换文字模式。",
      });
      setStage("语音连接失败");
    }
  }, [onEvent, playChunk, releaseCapture, sendControl, sessionId, stopPlayback]);
  connectRef.current = connect;

  /** 开始采集麦克风；沉浸模式在检测到回答后的连续静音时自动结束。 */
  const start = useCallback(async () => {
    if (!connected || !questionId || recording) return;
    setError(null);
    if (speaking) {
      const outputTurnId = outputTurnRef.current;
      stopPlayback();
      if (outputTurnId)
        sendControl({ type: "interrupt", questionId, turnId: outputTurnId });
    }
    try {
      const stream = await platformAdapter.voice.requestMicrophone({
        echoCancellation: true,
        noiseSuppression: true,
      });
      const context = platformAdapter.voice.createAudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silent = context.createGain();
      silent.gain.value = 0;
      const turnId = preservedTurnRef.current ?? crypto.randomUUID();
      preservedTurnRef.current = null;
      turnRef.current = turnId;
      sendControl({ type: "audio_start", sessionId, questionId, turnId, sampleRate: 16_000 });
      const startedAt = performance.now();
      let speechDetected = false;
      let lastSpeechAt = startedAt;
      processor.onaudioprocess = (event) => {
        const socket = socketRef.current;
        if (socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 512 * 1024) return;
        const samples = event.inputBuffer.getChannelData(0);
        socket.send(encodePcm16(samples, context.sampleRate));
        if (!autoStopOnSilence || endingRef.current) return;
        let energy = 0;
        for (let index = 0; index < samples.length; index += 1)
          energy += samples[index] * samples[index];
        const rms = Math.sqrt(energy / samples.length);
        const now = performance.now();
        if (rms > 0.018) {
          speechDetected = true;
          lastSpeechAt = now;
        }
        // 说话后连续 1.2 秒静音即提交；15 秒未开口也结束本轮并给 ASR 恢复机会。
        if (
          (speechDetected && now - lastSpeechAt > 1_200) ||
          (!speechDetected && now - startedAt > 15_000)
        ) {
          endingRef.current = true;
          processor.onaudioprocess = null;
          queueMicrotask(() => void stopRef.current());
        }
      };
      source.connect(processor);
      processor.connect(silent);
      silent.connect(context.destination);
      mediaRef.current = stream;
      captureContextRef.current = context;
      processorRef.current = processor;
      endingRef.current = false;
      setRecording(true);
      setStage("正在聆听，请自然回答");
    } catch {
      setError({
        code: "microphone_unavailable",
        message: "无法使用麦克风，请检查浏览器权限和设备占用后重试。",
      });
      setStage("麦克风不可用");
    }
  }, [autoStopOnSilence, connected, questionId, recording, sendControl, sessionId, speaking, stopPlayback]);

  /** 打断正在播放的 Agent TTS。 */
  const interrupt = useCallback(() => {
    const turnId = outputTurnRef.current;
    if (turnId && questionId)
      sendControl({ type: "interrupt", questionId, turnId });
    stopPlayback();
  }, [questionId, sendControl, stopPlayback]);

  /** 请求服务端校验并播报已经持久化的当前题目。 */
  const promptQuestion = useCallback(
    (nextQuestionId: string) => sendControl({ type: "prompt_question", questionId: nextQuestionId }),
    [sendControl],
  );

  /** 关闭 MediaStream、AudioContext 与 WebSocket。 */
  const dispose = useCallback(async () => {
    disposedRef.current = true;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    if (heartbeatTimerRef.current !== null) window.clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = null;
    await releaseCapture(false, false);
    socketRef.current?.close();
    socketRef.current = null;
    for (const timer of playbackTimersRef.current) window.clearTimeout(timer);
    playbackTimersRef.current.clear();
    stopPlayback();
    await playbackContextRef.current?.close().catch(() => undefined);
    playbackContextRef.current = null;
  }, [releaseCapture, stopPlayback]);

  useEffect(
    () => () => {
      void dispose();
    },
    [dispose],
  );

  return {
    connected,
    connecting,
    recording,
    speaking,
    stage,
    partial,
    error,
    connect,
    start,
    stop,
    interrupt,
    promptQuestion,
    dispose,
  };
}
