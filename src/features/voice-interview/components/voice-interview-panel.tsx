/** voice-interview - 语音面试主面板 */
import { AlertTriangle, Clock3, Mic, MicOff, PhoneCall, Radio, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { VoiceDebugLog, type VoiceDebugLogEntry, type VoiceDebugLogLevel } from "./voice-debug-log";
import { LiveTranscript } from "./live-transcript";
import { VoiceStatus, type VoiceStatusValue } from "./voice-status";
import { useAudioCapture } from "../hooks/use-audio-capture";
import { useAudioPlayback } from "../hooks/use-audio-playback";
import { useBargeIn } from "../hooks/use-barge-in";
import { useVoiceWebSocket } from "../hooks/use-voice-websocket";
import type { VoiceMessage, VoiceServerEvent } from "../types";

/**
 * 创建 turn id
 * @returns 
 */
function createTurnId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `turn-${Date.now()}`;
}

/**
 * 格式化 elapsed
 *
 * @param seconds - 
 * @returns 
 */
function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * voice interview panel
 * @returns 
 */
export function VoiceInterviewPanel({
  sessionId,
  initialQuestionId,
  initialQuestionIndex,
  totalQuestions,
  completed,
  onQuestionScored,
  onSessionCompleted,
  onRefresh,
}: {
  sessionId: string;
  initialQuestionId: string | null;
  initialQuestionIndex: number;
  totalQuestions: number;
  completed?: boolean;
  onQuestionScored: (questionId: string, score: number, feedback: string) => void;
  onSessionCompleted: (result: { overallScore: number; overallFeedback: string }) => void;
  onRefresh: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [partial, setPartial] = useState("");
  const [status, setStatus] = useState<VoiceStatusValue>("idle");
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [stageMessage, setStageMessage] = useState("等待开始语音面试");
  const [debugLogs, setDebugLogs] = useState<VoiceDebugLogEntry[]>([]);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(initialQuestionId);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(initialQuestionIndex);
  const [questionTotal, setQuestionTotal] = useState(totalQuestions);
  const currentTurnId = useRef<string | null>(null);
  const activeAssistantTurnId = useRef<string | null>(null);
  const hadConnection = useRef(false);
  const messageIndex = useRef(0);
  const debugIndex = useRef(0);
  const playback = useAudioPlayback();

  useEffect(() => {
    setCurrentQuestionId(initialQuestionId);
    setCurrentQuestionIndex(initialQuestionIndex);
    setQuestionTotal(totalQuestions);
  }, [initialQuestionId, initialQuestionIndex, totalQuestions]);

  const pushDebugLog = useCallback(
    (level: VoiceDebugLogLevel, label: string, detail?: string, turnId?: string) => {
      debugIndex.current += 1;
      setDebugLogs((prev) =>
        [
          {
            id: debugIndex.current,
            at: new Date().toLocaleTimeString(),
            level,
            label,
            detail,
            turnId,
          },
          ...prev,
        ].slice(0, 80),
      );
    },
    [],
  );

  /**
   * 推送 message
   *
   * @param message - 
   * @param "id" | "created_at"> - 
   * @returns 
   */
  function pushMessage(message: Omit<VoiceMessage, "id" | "created_at">) {
    messageIndex.current += 1;
    setMessages((prev) => [
      ...prev,
      {
        ...message,
        id: `voice-${messageIndex.current}`,
        created_at: new Date().toISOString(),
      },
    ]);
  }

  /**
   * upsert assistant message
   *
   * @param turnId - 
   * @param text - 
   * @param mode - 
   * @returns 
   */
  function upsertAssistantMessage(turnId: string, text: string, mode: "append" | "replace") {
    setMessages((prev) => {
      const existingIndex = prev.findIndex(
        (message) => message.turn_id === turnId && message.role === "assistant",
      );
      if (existingIndex >= 0) {
        return prev.map((message, index) =>
          index === existingIndex
            ? {
                ...message,
                content: mode === "append" ? `${message.content}${text}` : text,
              }
            : message,
        );
      }

      messageIndex.current += 1;
      return [
        ...prev,
        {
          id: `voice-${messageIndex.current}`,
          role: "assistant",
          content: text,
          created_at: new Date().toISOString(),
          source: "voice",
          turn_id: turnId,
        },
      ];
    });
  }

  /**
   * 更新 question progress
   * @returns 
   */
  function updateQuestionProgress(event: {
    questionId: string | null;
    currentQuestionIndex: number;
    totalQuestions: number;
  }) {
    setCurrentQuestionId(event.questionId);
    setCurrentQuestionIndex(event.currentQuestionIndex);
    setQuestionTotal(event.totalQuestions);
  }

  const handleServerEvent = useCallback(
    (event: VoiceServerEvent) => {
      if (event.type === "ready") {
        pushDebugLog("success", "WebSocket 已就绪", undefined, event.sessionId);
        return;
      }
      if (event.type === "session_ready") {
        updateQuestionProgress(event);
        setStatus("idle");
        setStageMessage("语音面试已就绪，AI 面试官将开始提问");
        pushDebugLog("success", "语音会话已就绪", undefined, event.sessionId);
        return;
      }
      if (event.type === "error") {
        pushDebugLog(
          "error",
          event.code ? `服务端错误：${event.code}` : "服务端返回错误",
          [
            event.stage ? `stage=${event.stage}` : "",
            event.retryable === false ? "不可重试" : "",
            event.detail || event.message,
          ]
            .filter(Boolean)
            .join(" · "),
          event.turnId,
        );
        toast.error(event.message);
        setStatus("error");
        setStageMessage(event.message);
        return;
      }
      if (event.type === "voice_stage") {
        pushDebugLog("info", event.stage, event.message, event.turnId);
        setStageMessage(event.message);
        return;
      }
      if (event.type === "interviewer_prompt_start") {
        updateQuestionProgress({
          questionId: event.questionId,
          currentQuestionIndex: event.currentQuestionIndex,
          totalQuestions: event.totalQuestions,
        });
        activeAssistantTurnId.current = event.turnId;
        upsertAssistantMessage(event.turnId, event.text, "replace");
        setStatus("speaking");
        setStageMessage("AI 面试官正在读题");
        pushDebugLog("info", "AI 开始读题", undefined, event.turnId);
        return;
      }
      if (event.type === "interviewer_prompt_end") {
        activeAssistantTurnId.current = null;
        setStatus("idle");
        setStageMessage("请点击开始回答，像真实面试一样作答");
        pushDebugLog("success", "AI 读题完成", undefined, event.turnId);
        return;
      }
      if (event.type === "transcript_partial") {
        setPartial(event.text);
        setStageMessage("正在实时识别你的回答");
        return;
      }
      if (event.type === "transcript_final") {
        pushDebugLog("success", "ASR 返回最终字幕", event.text.slice(0, 120), event.turnId);
        setPartial("");
        setStatus("thinking");
        setStageMessage("已识别，AI 面试官正在思考");
        pushMessage({
          role: "user",
          content: event.text,
          source: "voice",
          turn_id: event.turnId,
        });
        return;
      }
      if (event.type === "assistant_text") {
        upsertAssistantMessage(event.turnId, event.text, "replace");
        setStageMessage("AI 面试官字幕已生成");
        return;
      }
      if (event.type === "assistant_text_delta") {
        setStatus("thinking");
        setStageMessage("AI 面试官回复生成中");
        upsertAssistantMessage(event.turnId, event.text, "append");
        return;
      }
      if (event.type === "assistant_text_done") {
        pushDebugLog("success", "LLM 文本生成完成", undefined, event.turnId);
        setStageMessage("AI 面试官文字已生成，正在处理语音");
        return;
      }
      if (event.type === "assistant_audio_chunk") {
        return;
      }
      if (event.type === "assistant_audio_start") {
        activeAssistantTurnId.current = event.turnId;
        playback.start(event.turnId, event.sampleRate);
        setStatus("speaking");
        setStageMessage("AI 面试官正在说话");
        pushDebugLog("info", "TTS 音频开始播放", `${event.sampleRate} Hz`, event.turnId);
        return;
      }
      if (event.type === "assistant_audio_end") {
        void playback.finish(event.turnId).catch(() => {
          pushDebugLog("error", "AI 语音播放失败", undefined, event.turnId);
          toast.error("AI 语音播放失败");
        });
        activeAssistantTurnId.current = null;
        setStatus("idle");
        pushDebugLog("success", "TTS 音频播放完成", undefined, event.turnId);
        setStageMessage("AI 语音播放完成，请开始回答");
        return;
      }
      if (event.type === "interrupted") {
        playback.stop();
        activeAssistantTurnId.current = null;
        setStatus("interrupted");
        setStageMessage("已打断 AI 语音");
        setMessages((prev) =>
          prev.map((message) =>
            message.turn_id === event.turnId && message.role === "assistant"
              ? { ...message, interrupted: true }
              : message,
          ),
        );
        return;
      }
      if (event.type === "generation_cancelled") {
        playback.stop();
        activeAssistantTurnId.current = null;
        setStatus("interrupted");
        setStageMessage("已取消上一轮生成");
        return;
      }
      if (event.type === "question_scored") {
        setStatus("scored");
        setStageMessage("本题已自动评分，等待 AI 进入下一题");
        onQuestionScored(event.questionId, event.score, event.feedback);
        void onRefresh();
        toast.success("本题已自动评分");
        pushDebugLog("success", "本题评分完成", `score=${event.score}`, event.questionId);
        return;
      }
      if (event.type === "next_question") {
        updateQuestionProgress(event);
        setPartial("");
        setStatus("speaking");
        setStageMessage("AI 面试官正在进入下一题");
        void onRefresh();
        pushDebugLog("info", "进入下一题", undefined, event.questionId);
        return;
      }
      if (event.type === "session_completed") {
        setStatus("scored");
        setStageMessage("整场语音面试已完成");
        onSessionCompleted({
          overallScore: event.overallScore,
          overallFeedback: event.overallFeedback,
        });
        void onRefresh();
        pushDebugLog("success", "语音面试完成", `overallScore=${event.overallScore}`);
      }
    },
    [onQuestionScored, onRefresh, onSessionCompleted, playback, pushDebugLog],
  );

  const voiceSocket = useVoiceWebSocket({
    sessionId,
    onEvent: handleServerEvent,
    onAudioChunk: (turnId, chunk) => playback.addChunk(turnId, chunk),
    onDebug: (event) => {
      pushDebugLog(event.level, event.label, event.detail);
      if (event.level === "error") {
        setStatus("error");
        setStageMessage(event.detail || event.label);
      }
    },
  });

  useEffect(() => {
    if (voiceSocket.connected) {
      hadConnection.current = true;
      setConnectedAt((current) => current ?? Date.now());
      return;
    }
    if (hadConnection.current && !completed) {
      setStatus("error");
      setStageMessage("语音连接已断开，请重新连接后继续");
    }
    hadConnection.current = false;
    setConnectedAt(null);
    setElapsedSeconds(0);
  }, [completed, voiceSocket.connected]);

  useEffect(() => {
    if (!connectedAt) return;
    /**
     * 更新
     * @returns 
     */
    const update = () => setElapsedSeconds(Math.floor((Date.now() - connectedAt) / 1000));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [connectedAt]);

  const bargeIn = useBargeIn({
    speaking: playback.speaking,
    activeTurnId: activeAssistantTurnId.current,
    stopPlayback: playback.stop,
    sendInterrupt: (turnId) => {
      if (!currentQuestionId) return;
      voiceSocket.sendJson({
        type: "interrupt",
        questionId: currentQuestionId,
        turnId,
      });
      pushDebugLog("warning", "发送打断事件", undefined, turnId);
    },
  });

  const capture = useAudioCapture({
    onChunk: (chunk) => {
      if (!currentTurnId.current) return;
      voiceSocket.sendAudioChunk(chunk);
    },
    onSpeechStart: bargeIn,
    onDebug: (stats) => {
      if (stats.state === "starting") {
        pushDebugLog("info", "正在初始化麦克风采集");
        setStageMessage("正在请求麦克风权限并初始化采集");
        return;
      }
      if (stats.state === "no-input") {
        pushDebugLog("warning", "浏览器暂未采集到麦克风音频");
        setStageMessage("浏览器未采集到麦克风音频，请检查麦克风权限和输入设备");
        return;
      }
      if (stats.state === "stopped") {
        pushDebugLog(
          stats.bytes > 0 ? "success" : "warning",
          "本地录音已停止",
          `${stats.chunks} chunks, ${stats.bytes} bytes`,
          currentTurnId.current ?? undefined,
        );
        setStageMessage(`本地录音已停止，共采集 ${stats.chunks} 块，${stats.bytes} 字节`);
        return;
      }
      setStageMessage(
        `本地录音中：${stats.chunks} 块，${stats.bytes} 字节，音量 ${stats.rms.toFixed(4)}${
          stats.speaking ? "，检测到说话" : ""
        }`,
      );
    },
  });

  /**
   * 连接
   * @returns Promise<
   */
  async function connect() {
    await voiceSocket.connect();
  }

  /**
   * 启动 answer
   * @returns Promise<
   */
  async function startAnswer() {
    if (!voiceSocket.connected) {
      toast.error("请先开始语音面试");
      return;
    }
    if (!currentQuestionId) {
      toast.error("当前没有可回答的问题");
      return;
    }
    if (completed) {
      toast.error("语音面试已完成");
      return;
    }

    bargeIn();
    const turnId = createTurnId();
    currentTurnId.current = turnId;
    setStatus("listening");
    setStageMessage("正在录音，请开始回答");
    pushDebugLog("info", "发送 audio_start", `${capture.sampleRate} Hz`, turnId);
    voiceSocket.sendJson({
      type: "audio_start",
      sessionId,
      questionId: currentQuestionId,
      turnId,
      sampleRate: capture.sampleRate,
    });
    try {
      await capture.start();
      pushDebugLog("success", "麦克风采集已开始", undefined, turnId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "麦克风启动失败";
      voiceSocket.sendJson({
        type: "interrupt",
        questionId: currentQuestionId,
        turnId,
      });
      currentTurnId.current = null;
      setStatus("error");
      setStageMessage(message);
      pushDebugLog("error", "麦克风启动失败", message, turnId);
      toast.error(message);
    }
  }

  /**
   * 停止 answer
   * @returns Promise<
   */
  async function stopAnswer() {
    if (!currentTurnId.current) return;
    await capture.stop();
    voiceSocket.sendJson({
      type: "audio_end",
      turnId: currentTurnId.current,
    });
    pushDebugLog("info", "发送 audio_end", undefined, currentTurnId.current);
    currentTurnId.current = null;
    setStatus("thinking");
    setStageMessage("回答已发送，等待语音识别结果");
  }

  /**
   * interrupt
   * @returns 
   */
  function interrupt() {
    if (!activeAssistantTurnId.current || !currentQuestionId) return;
    playback.stop();
    voiceSocket.sendJson({
      type: "interrupt",
      questionId: currentQuestionId,
      turnId: activeAssistantTurnId.current,
    });
    pushDebugLog("warning", "手动打断 AI 语音", undefined, activeAssistantTurnId.current);
  }

  const displayedIndex = questionTotal > 0 ? currentQuestionIndex + 1 : 0;
  const resolvedStatus: VoiceStatusValue = voiceSocket.connecting
    ? "connecting"
    : playback.speaking
      ? "speaking"
      : status;
  const latestError = debugLogs.find((entry) => entry.level === "error");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-voice-muted">
        <div className="inline-flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {voiceSocket.connected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-50" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                voiceSocket.connected ? "bg-success" : "bg-voice-muted/45"
              }`}
            />
          </span>
          {voiceSocket.connected ? "语音服务已连接" : "语音服务未连接"}
        </div>
        <div className="inline-flex items-center gap-3 font-medium text-voice-foreground">
          <span>
            第 {displayedIndex} 轮<span className="mx-1 text-voice-muted">/</span>共{" "}
            {questionTotal || 0} 轮
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums text-voice-muted">
            <Clock3 className="size-3.5" />
            {formatElapsed(elapsedSeconds)}
          </span>
        </div>
      </div>

      <div className="flex min-h-64 items-center justify-center py-5 sm:min-h-72">
        <VoiceStatus status={resolvedStatus} message={stageMessage} />
      </div>

      {latestError && (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-voice-foreground"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <div className="font-medium">语音服务遇到问题</div>
            <div className="mt-0.5 break-words text-xs leading-5 text-voice-muted">
              {latestError.detail || latestError.label}
            </div>
            <div className="mt-1 text-xs leading-5 text-voice-muted">
              请检查网络或麦克风权限，然后使用下方连接或回答按钮重试。
            </div>
          </div>
        </div>
      )}

      <LiveTranscript messages={messages} partial={partial} stageMessage={stageMessage} />

      <div className="sticky bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-10 rounded-2xl border border-voice-border bg-voice-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl sm:static sm:bg-voice-surface sm:pb-3 sm:shadow-none">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-center">
          <Button
            type="button"
            size="lg"
            onClick={() => void connect()}
            disabled={voiceSocket.connected || voiceSocket.connecting || completed}
            className="col-span-2 min-h-12 bg-voice-foreground text-voice-background hover:bg-voice-foreground/90 sm:col-span-1"
          >
            <PhoneCall className="mr-1 h-4 w-4" />
            {voiceSocket.connected ? "面试进行中" : "进入语音面试"}
          </Button>
          {capture.recording ? (
            <Button
              type="button"
              size="lg"
              onClick={stopAnswer}
              className="col-span-2 min-h-12 bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:col-span-1"
            >
              <MicOff className="mr-1 h-4 w-4" />
              结束回答
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              onClick={() => void startAnswer()}
              disabled={
                !voiceSocket.connected || !currentQuestionId || completed || playback.speaking
              }
              className="min-h-12 bg-success text-success-foreground hover:bg-success/90"
            >
              <Mic className="mr-1 h-4 w-4" />
              开始回答
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={interrupt}
            disabled={!playback.speaking}
            className="min-h-12 border-voice-border bg-voice-surface-strong text-voice-foreground hover:bg-voice-surface"
          >
            <XCircle className="mr-1 h-4 w-4" />
            打断 AI
          </Button>
        </div>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-voice-muted">
          <Radio className="h-3 w-3" />
          回答结束后请主动点击“结束回答”，AI 才会继续处理
        </p>
      </div>

      <VoiceDebugLog
        entries={debugLogs}
        onClear={() => setDebugLogs([])}
        connected={voiceSocket.connected}
        microphoneActive={capture.recording}
      />
    </div>
  );
}
