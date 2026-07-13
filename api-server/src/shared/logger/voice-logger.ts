/** 全后端共享的 consola 模块日志、流量降噪与敏感元数据脱敏。 */
import { createConsola } from "consola";

const HIGH_VOLUME_EVENTS = new Set([
  "ws_audio_received",
  "qwen_asr_audio_sent",
  "qwen_asr_event",
  "qwen_tts_audio_received",
  "asr_partial",
]);

/** 递归替换敏感键，避免嵌套 Provider 元数据泄漏凭据。 */
function sanitize(meta: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    clean[key] = /key|token|authorization|secret|password|credential/i.test(key)
      ? "[redacted]"
      : value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Error)
        ? sanitize(value as Record<string, unknown>)
        : value;
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

/** 记录语音事件；高频事件仅在 verbose 模式输出。 */
export function voiceLog(event: string, meta: Record<string, unknown> = {}): void {
  if (process.env.VOICE_VERBOSE_LOGS !== "1" && HIGH_VOLUME_EVENTS.has(event)) return;
  voiceLogger.info(event, meta);
}

/** 记录可恢复警告。 */
export function voiceWarn(event: string, meta: Record<string, unknown> = {}): void {
  voiceLogger.warn(event, meta);
}

/** 以 Error 为首参数记录失败和安全元数据。 */
export function voiceError(event: string, error: unknown, meta: Record<string, unknown> = {}): void {
  voiceLogger.error(error instanceof Error?error:new Error(String(error)), { event, ...meta });
}

/** 创建带固定 tag 且共享脱敏 reporter 的模块 logger。 */
export function createModuleLogger(tag: string) {
  return createConsola({
    reporters: [SANITIZE_REPORTER as any],
  }).withTag(tag);
}
