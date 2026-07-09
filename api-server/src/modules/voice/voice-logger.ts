type VoiceLogMeta = Record<string, unknown>;

function sanitize(meta: VoiceLogMeta): VoiceLogMeta {
  const clean: VoiceLogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (/key|token|authorization|secret/i.test(key)) {
      clean[key] = "[redacted]";
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export function voiceLog(event: string, meta: VoiceLogMeta = {}): void {
  console.info(`[voice] ${event}`, JSON.stringify(sanitize(meta)));
}

export function voiceError(event: string, error: unknown, meta: VoiceLogMeta = {}): void {
  const errorMeta =
    error instanceof Error
      ? { error: error.message, stack: error.stack }
      : { error: String(error) };
  console.error(`[voice] ${event}`, JSON.stringify(sanitize({ ...meta, ...errorMeta })));
}
