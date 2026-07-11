import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { connectVoiceSession } from "../api";
import type { VoiceServerEvent } from "../types";

type VoiceSocketDebugEvent = {
  level: "info" | "success" | "warning" | "error";
  label: string;
  detail?: string;
};

export function useVoiceWebSocket(params: {
  sessionId: string;
  onEvent: (event: VoiceServerEvent) => void;
  onAudioChunk: (turnId: string, chunk: ArrayBuffer) => void;
  onDebug?: (event: VoiceSocketDebugEvent) => void;
  onBackpressure?: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const audioTurnId = useRef<string | null>(null);
  const pendingAudio = useRef<ArrayBuffer[]>([]);
  const pendingAudioEnd = useRef<string | null>(null);
  const flushTimer = useRef<number | null>(null);

  function scheduleAudioFlush() {
    if (flushTimer.current != null) return;
    flushTimer.current = window.setInterval(() => {
      const ws = socket.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      while (pendingAudio.current.length > 0 && ws.bufferedAmount < 128 * 1024) {
        ws.send(pendingAudio.current.shift()!);
      }
      if (pendingAudio.current.length === 0 && flushTimer.current != null) {
        if (pendingAudioEnd.current) {
          ws.send(pendingAudioEnd.current);
          pendingAudioEnd.current = null;
        }
        window.clearInterval(flushTimer.current);
        flushTimer.current = null;
      }
    }, 20);
  }

  const connect = useCallback(async () => {
    if (socket.current?.readyState === WebSocket.OPEN || connecting) return;
    setConnecting(true);
    try {
      params.onDebug?.({ level: "info", label: "正在创建语音连接" });
      const { wsUrl } = await connectVoiceSession(params.sessionId);
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      socket.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setConnecting(false);
        params.onDebug?.({ level: "success", label: "WebSocket 已连接" });
      };
      ws.onclose = (event) => {
        setConnected(false);
        setConnecting(false);
        audioTurnId.current = null;
        pendingAudio.current = [];
        pendingAudioEnd.current = null;
        params.onDebug?.({
          level: event.wasClean ? "info" : "warning",
          label: "WebSocket 已关闭",
          detail: `code=${event.code}${event.reason ? `, reason=${event.reason}` : ""}`,
        });
      };
      ws.onerror = () => {
        toast.error("语音连接异常");
        params.onDebug?.({ level: "error", label: "WebSocket 连接异常" });
      };
      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (audioTurnId.current) {
            params.onAudioChunk(audioTurnId.current, event.data);
          } else {
            params.onDebug?.({
              level: "warning",
              label: "收到未绑定 turn 的音频",
              detail: `${event.data.byteLength} bytes`,
            });
          }
          return;
        }

        try {
          const data = JSON.parse(String(event.data)) as VoiceServerEvent;
          if (data.type === "assistant_audio_start") {
            audioTurnId.current = data.turnId;
          }
          if (
            data.type === "assistant_audio_end" ||
            data.type === "generation_cancelled" ||
            data.type === "interrupted"
          ) {
            audioTurnId.current = null;
          }
          params.onEvent(data);
        } catch (err) {
          params.onDebug?.({
            level: "warning",
            label: "收到无法解析的服务端事件",
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      };
    } catch (err) {
      setConnecting(false);
      toast.error(err instanceof Error ? err.message : "语音连接失败");
      params.onDebug?.({
        level: "error",
        label: "语音连接失败",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }, [connecting, params]);

  function sendJson(value: unknown) {
    if (socket.current?.readyState === WebSocket.OPEN) {
      if (
        typeof value === "object" && value !== null &&
        (value as { type?: string }).type === "audio_end" &&
        pendingAudio.current.length > 0
      ) {
        pendingAudioEnd.current = JSON.stringify(value);
        scheduleAudioFlush();
        return;
      }
      socket.current.send(JSON.stringify(value));
    }
  }

  function sendAudioChunk(chunk: ArrayBuffer) {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount < 256 * 1024 && pendingAudio.current.length === 0) {
        ws.send(chunk);
        return;
      }
      pendingAudio.current.push(chunk);
      if (pendingAudio.current.length > 100) {
        pendingAudio.current = [];
        params.onBackpressure?.();
        ws.close(1013, "Audio backpressure limit exceeded");
        return;
      }
      scheduleAudioFlush();
    }
  }

  function disconnect() {
    socket.current?.close();
    socket.current = null;
    pendingAudio.current = [];
    pendingAudioEnd.current = null;
    setConnected(false);
  }

  useEffect(() => {
    return () => {
      socket.current?.close();
      if (flushTimer.current != null) window.clearInterval(flushTimer.current);
    };
  }, []);

  return {
    connected,
    connecting,
    connect,
    disconnect,
    sendJson,
    sendAudioChunk,
  };
}
