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
}) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const audioTurnId = useRef<string | null>(null);

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
      socket.current.send(JSON.stringify(value));
    }
  }

  function sendAudioChunk(chunk: ArrayBuffer) {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(chunk);
    }
  }

  function disconnect() {
    socket.current?.close();
    socket.current = null;
    setConnected(false);
  }

  useEffect(() => {
    return () => {
      socket.current?.close();
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
