/** 通义千问语音识别 WebSocket 客户端 */
import {
  createQwenAsrSession,
  runQwenRealtimeTask,
  type QwenAsrSession,
} from "./qwen-realtime.client.js";

export type QwenAsrResult = {
  text: string;
  confidence: number | null;
};

/**
 * transcribe with qwen
 * @returns
 */
export async function transcribeWithQwen(params: {
  audioChunks: Buffer[];
  sampleRate: number;
  signal?: AbortSignal;
}): Promise<QwenAsrResult> {
  const result = await runQwenRealtimeTask({
    kind: "asr",
    model: process.env.QWEN_ASR_MODEL?.trim() || "qwen3-asr-flash-realtime",
    audioChunks: params.audioChunks,
    sampleRate: Number(process.env.QWEN_ASR_SAMPLE_RATE || params.sampleRate || "16000"),
    signal: params.signal,
  });

  return {
    text: result.text,
    confidence: null,
  };
}

/**
 * 创建 streaming asr session
 * @returns
 */
export function createStreamingAsrSession(params: {
  sampleRate: number;
  signal?: AbortSignal;
}): QwenAsrSession {
  return createQwenAsrSession({
    model: process.env.QWEN_ASR_MODEL?.trim() || "qwen3-asr-flash-realtime",
    sampleRate: Number(process.env.QWEN_ASR_SAMPLE_RATE || params.sampleRate || "16000"),
    signal: params.signal,
  });
}
