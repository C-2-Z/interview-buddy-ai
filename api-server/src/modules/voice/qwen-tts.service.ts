/** 通义千问语音合成 */
import {
  runQwenRealtimeTask,
  streamQwenTtsAudio,
} from "./qwen-realtime.client.js";

/**
 * qwen tts sample rate
 * @returns 
 */
export function qwenTtsSampleRate(): number {
  return Number(process.env.QWEN_TTS_SAMPLE_RATE || "24000");
}

/**
 * synthesize with qwen
 * @returns 
 */
export async function synthesizeWithQwen(params: {
  text: string;
  signal?: AbortSignal;
}): Promise<{ audio: Buffer; sampleRate: number }> {
  const sampleRate = qwenTtsSampleRate();
  const result = await runQwenRealtimeTask({
    kind: "tts",
    model: process.env.QWEN_TTS_MODEL?.trim() || "qwen3-tts-flash-realtime",
    inputText: params.text,
    voice: process.env.QWEN_TTS_VOICE?.trim() || "Cherry",
    sampleRate,
    signal: params.signal,
  });

  return {
    audio: result.audio,
    sampleRate,
  };
}

/**
 * stream speech with qwen
 * @returns 
 */
export function streamSpeechWithQwen(params: {
  text: string;
  signal?: AbortSignal;
}): AsyncIterable<Buffer> {
  const sampleRate = qwenTtsSampleRate();
  return streamQwenTtsAudio({
    model: process.env.QWEN_TTS_MODEL?.trim() || "qwen3-tts-flash-realtime",
    inputText: params.text,
    voice: process.env.QWEN_TTS_VOICE?.trim() || "Cherry",
    sampleRate,
    signal: params.signal,
  });
}
