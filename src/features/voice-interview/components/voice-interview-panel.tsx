import { Mic, MicOff, PhoneCall, Volume2, XCircle } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LiveTranscript } from "./live-transcript";
import { VoiceStatus, type VoiceStatusValue } from "./voice-status";
import { useAudioCapture } from "../hooks/use-audio-capture";
import { useAudioPlayback } from "../hooks/use-audio-playback";
import { useBargeIn } from "../hooks/use-barge-in";
import { useVoiceWebSocket } from "../hooks/use-voice-websocket";
import type {
  VoiceMessage,
  VoicePanelQuestion,
  VoiceServerEvent,
} from "../types";

function createTurnId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `turn-${Date.now()}`;
}

export function VoiceInterviewPanel({
  sessionId,
  question,
  onAutoScore,
  onRefresh,
}: {
  sessionId: string;
  question: VoicePanelQuestion;
  onAutoScore: (score: number, feedback: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [partial, setPartial] = useState("");
  const [status, setStatus] = useState<VoiceStatusValue>("idle");
  const [stageMessage, setStageMessage] = useState("等待语音输入");
  const currentTurnId = useRef<string | null>(null);
  const activeAssistantTurnId = useRef<string | null>(null);
  const messageIndex = useRef(0);
  const playback = useAudioPlayback();

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

  function upsertAssistantMessage(
    turnId: string,
    text: string,
    mode: "append" | "replace",
  ) {
    setMessages((prev) => {
      const existingIndex = prev.findIndex(
        (message) => message.turn_id === turnId && message.role === "assistant",
      );
      if (existingIndex >= 0) {
        return prev.map((message, index) =>
          index === existingIndex
            ? {
                ...message,
                content:
                  mode === "append" ? `${message.content}${text}` : text,
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

  const handleServerEvent = useCallback(
    (event: VoiceServerEvent) => {
      if (event.type === "ready") {
        setStatus("idle");
        setStageMessage("语音连接已就绪");
        return;
      }
      if (event.type === "error") {
        toast.error(event.message);
        setStatus("idle");
        setStageMessage(event.message);
        return;
      }
      if (event.type === "voice_stage") {
        setStageMessage(event.message);
        return;
      }
      if (event.type === "transcript_partial") {
        setPartial(event.text);
        setStageMessage("正在实时识别你的回答");
        return;
      }
      if (event.type === "transcript_final") {
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
        setStageMessage("AI 面试官字幕生成中");
        upsertAssistantMessage(event.turnId, event.text, "append");
        return;
      }
      if (event.type === "assistant_text_done") {
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
        return;
      }
      if (event.type === "assistant_audio_end") {
        void playback.finish(event.turnId).catch(() => {
          toast.error("AI 语音播放失败");
        });
        setStageMessage("AI 语音播放完成，等待评分判断");
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
        setStageMessage("本题已自动评分");
        onAutoScore(event.score, event.feedback);
        toast.success("本题已自动评分");
        return;
      }
      if (event.type === "next_question") {
        setStageMessage("正在进入下一题");
        void onRefresh();
        return;
      }
      if (event.type === "session_completed") {
        setStageMessage("整场面试已完成");
        void onRefresh();
      }
    },
    [onAutoScore, onRefresh, playback],
  );

  const voiceSocket = useVoiceWebSocket({
    sessionId,
    onEvent: handleServerEvent,
    onAudioChunk: (turnId, chunk) => playback.addChunk(turnId, chunk),
  });

  const bargeIn = useBargeIn({
    speaking: playback.speaking,
    activeTurnId: activeAssistantTurnId.current,
    stopPlayback: playback.stop,
    sendInterrupt: (turnId) => {
      voiceSocket.sendJson({
        type: "interrupt",
        questionId: question.id,
        turnId,
      });
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
        setStageMessage("正在请求麦克风权限并初始化采集");
        return;
      }
      if (stats.state === "no-input") {
        setStageMessage("浏览器未采集到麦克风音频，请检查麦克风权限和输入设备");
        return;
      }
      if (stats.state === "stopped") {
        setStageMessage(
          `本地录音已停止，共采集 ${stats.chunks} 块，${stats.bytes} 字节`,
        );
        return;
      }
      setStageMessage(
        `本地录音中：${stats.chunks} 块，${stats.bytes} 字节，音量 ${stats.rms.toFixed(4)}${
          stats.speaking ? "，检测到说话" : ""
        }`,
      );
    },
  });

  async function startAnswer() {
    if (!voiceSocket.connected) {
      toast.error("请先连接语音面试");
      return;
    }
    if (question.score != null) {
      toast.error("本题已评分");
      return;
    }

    bargeIn();
    const turnId = createTurnId();
    currentTurnId.current = turnId;
    setStatus("listening");
    setStageMessage("正在录音，请开始回答");
    voiceSocket.sendJson({
      type: "audio_start",
      sessionId,
      questionId: question.id,
      turnId,
      sampleRate: capture.sampleRate,
    });
    await capture.start();
  }

  async function stopAnswer() {
    if (!currentTurnId.current) return;
    await capture.stop();
    voiceSocket.sendJson({
      type: "audio_end",
      turnId: currentTurnId.current,
    });
    currentTurnId.current = null;
    setStatus("thinking");
    setStageMessage("回答已发送，等待语音识别结果");
  }

  function interrupt() {
    if (!activeAssistantTurnId.current) return;
    playback.stop();
    voiceSocket.sendJson({
      type: "interrupt",
      questionId: question.id,
      turnId: activeAssistantTurnId.current,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <VoiceStatus
            status={
              voiceSocket.connecting
                ? "connecting"
                : playback.speaking
                  ? "speaking"
                  : status
            }
          />
          {playback.speaking && (
            <span className="inline-flex items-center text-xs text-muted-foreground">
              <Volume2 className="mr-1 h-3 w-3" />
              AI 正在说话
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={voiceSocket.connect}
            disabled={voiceSocket.connected || voiceSocket.connecting}
          >
            <PhoneCall className="mr-1 h-4 w-4" />
            {voiceSocket.connected ? "已连接" : "连接语音"}
          </Button>
          {capture.recording ? (
            <Button type="button" size="sm" onClick={stopAnswer}>
              <MicOff className="mr-1 h-4 w-4" />
              结束回答
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => void startAnswer()}
              disabled={!voiceSocket.connected || question.score != null}
            >
              <Mic className="mr-1 h-4 w-4" />
              开始回答
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={interrupt}
            disabled={!playback.speaking}
          >
            <XCircle className="mr-1 h-4 w-4" />
            打断
          </Button>
        </div>
      </div>

      <LiveTranscript
        messages={messages}
        partial={partial}
        stageMessage={stageMessage}
      />
    </div>
  );
}
