import { createConsola } from "consola";

const HIGH_VOLUME_EVENTS = new Set([
  "ws_audio_received",
  "qwen_asr_audio_sent",
  "qwen_asr_event",
  "qwen_tts_audio_received",
  "asr_partial",
]);

function sanitize(meta: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    clean[key] = /key|token|authorization|secret/i.test(key) ? "[redacted]" : value;
  }
  return clean;
}

const SANITIZE_REPORTER = {
  log(logObj: Record<string, unknown>) {
    if (logObj.args && Array.isArray(logObj.args)) {
      logObj.args = logObj.args.map((arg: unknown) =>
        arg && typeof arg === "object" && !(arg instanceof Error)
          ? sanitize(arg as Record<string, unknown>)
          : arg,
      );
    }
  },
};

export const voiceLogger = createConsola({
  reporters: [SANITIZE_REPORTER as any],
}).withTag("voice");

export function voiceLog(event: string, meta: Record<string, unknown> = {}): void {
  if (process.env.VOICE_VERBOSE_LOGS !== "1" && HIGH_VOLUME_EVENTS.has(event)) return;
  voiceLogger.info(event, meta);
}

export function voiceWarn(event: string, meta: Record<string, unknown> = {}): void {
  voiceLogger.warn(event, meta);
}

export function voiceError(event: string, error: unknown, meta: Record<string, unknown> = {}): void {
  voiceLogger.error(error, { event, ...meta });
}

export function createModuleLogger(tag: string) {
  return createConsola({
    reporters: [SANITIZE_REPORTER as any],
  }).withTag(tag);
}
