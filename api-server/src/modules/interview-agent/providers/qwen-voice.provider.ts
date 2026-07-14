/** Qwen voice Provider adapter. */
import { createModuleLogger } from "../../../shared/logger/voice-logger.js";
import type { QwenAsrSession, QwenTtsSession } from "../../voice/qwen-realtime.client.js";
import { createStreamingAsrSession } from "../../voice/qwen-asr.service.js";
import {
  createReusableSpeechSession,
  qwenTtsSampleRate,
  streamSpeechWithQwen,
} from "../../voice/qwen-tts.service.js";
import type {
  AsrSessionConfig,
  SpeakInput,
  StreamingAsrSession,
  StreamingTtsSession,
  TtsSessionConfig,
  VoiceProvider,
} from "./voice.provider.js";

const logger = createModuleLogger("qwen-voice-provider");

function adaptQwenAsrSession(session: QwenAsrSession): StreamingAsrSession {
  return {
    events: session.events,
    sendAudio: (chunk: Buffer) => session.sendAudio(chunk),
    finish: () => session.finish(),
    abort: () => session.abort(),
  };
}

function adaptQwenTtsSession(session: QwenTtsSession): StreamingTtsSession {
  return {
    get closed() {
      return session.closed;
    },
    speak: (text: string, signal?: AbortSignal) => session.speak(text, signal),
    close: () => session.close(),
  };
}

function resolveAsrModel(): string {
  return process.env.QWEN_ASR_MODEL?.trim() || "qwen3-asr-flash-realtime";
}

function resolveVoice(): string {
  return process.env.QWEN_TTS_VOICE?.trim() || "Cherry";
}

export function createQwenVoiceProvider(): VoiceProvider {
  let ttsSession: ReturnType<typeof createReusableSpeechSession> | undefined;

  function ensureTtsSession() {
    if (ttsSession?.closed) {
      ttsSession = undefined;
    }
    ttsSession ??= createReusableSpeechSession();
    return ttsSession;
  }

  return {
    outputSampleRate: qwenTtsSampleRate(),
    createAsrSession(input: AsrSessionConfig): StreamingAsrSession {
      logger.debug("Creating Qwen ASR session", {
        sampleRate: input.sampleRate,
        model: resolveAsrModel(),
      });
      const session = createStreamingAsrSession({
        sampleRate: input.sampleRate,
        signal: input.signal,
      });
      return adaptQwenAsrSession(session);
    },

    createTtsSession(input: TtsSessionConfig): StreamingTtsSession {
      logger.debug("Creating Qwen TTS session", {
        sampleRate: input.sampleRate,
        voice: input.voice ?? resolveVoice(),
      });
      const session = createReusableSpeechSession();
      return adaptQwenTtsSession(session);
    },

    async *speak(input: SpeakInput, signal?: AbortSignal): AsyncIterable<Buffer> {
      const session = ensureTtsSession();
      if (!session.closed) {
        yield* session.speak(input.text, signal);
      } else {
        logger.debug("TTS session closed, falling back to one-shot streamSpeechWithQwen");
        yield* streamSpeechWithQwen({ text: input.text, signal });
      }
    },

    async interrupt(turnId: string): Promise<void> {
      logger.info("VoiceProvider interrupt requested", { turnId });
      ttsSession?.close();
      ttsSession = undefined;
    },

    async close(): Promise<void> {
      logger.info("Closing Qwen voice provider");
      ttsSession?.close();
      ttsSession = undefined;
    },
  };
}

export function createVoiceProviderFromEnv(): VoiceProvider {
  return createQwenVoiceProvider();
}
