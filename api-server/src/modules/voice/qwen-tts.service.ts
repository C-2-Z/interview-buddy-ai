import {
  createQwenTtsSession,
  runQwenRealtimeTask,
  streamQwenTtsAudio,
} from "./qwen-realtime.client.js";

export function qwenTtsSampleRate(): number {
  return Number(process.env.QWEN_TTS_SAMPLE_RATE || "24000");
}

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

export function createReusableSpeechSession() {
  return createQwenTtsSession({
    model: process.env.QWEN_TTS_MODEL?.trim() || "qwen3-tts-flash-realtime",
    voice: process.env.QWEN_TTS_VOICE?.trim() || "Cherry",
    sampleRate: qwenTtsSampleRate(),
  });
}
