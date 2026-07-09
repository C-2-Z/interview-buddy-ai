import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { connectVoiceSession } from "../api";
import type { VoiceServerEvent } from "../types";

export function useVoiceWebSocket(params: {
  sessionId: string;
  onEvent: (event: VoiceServerEvent) => void;
  onAudioChunk: (turnId: string, chunk: ArrayBuffer) => void;
}) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const audioTurnId = useRef<string | null>(null);

  const connect = useCallback(async () => {
    if (socket.current?.readyState === WebSocket.OPEN || connecting) return;
    setConnecting(true);
    try {
      const { wsUrl } = await connectVoiceSession(params.sessionId);
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      socket.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setConnecting(false);
      };
      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
        audioTurnId.current = null;
      };
      ws.onerror = () => {
        toast.error("语音连接异常");
      };
      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (audioTurnId.current) {
            params.onAudioChunk(audioTurnId.current, event.data);
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
        } catch {
          // Ignore malformed server events.
        }
      };
    } catch (err) {
      setConnecting(false);
      toast.error(err instanceof Error ? err.message : "语音连接失败");
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

  return {
    connected,
    connecting,
    connect,
    disconnect,
    sendJson,
    sendAudioChunk,
  };
}
