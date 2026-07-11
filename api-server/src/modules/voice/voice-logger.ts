/** 语音模块 consola logger（含脱敏）*/
import { createConsola } from "consola";

/**
 * 消毒
 *
 * @param meta - 
 * @param unknown> - 
 * @returns 
 */
function sanitize(meta: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (/key|token|authorization|secret/i.test(key)) {
      clean[key] = "[redacted]";
    } else {
      clean[key] = value;
    }
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

/**
 * voice 记录日志
 *
 * @param event - 
 * @param meta - 
 * @returns void
 */
export function voiceLog(event: string, meta: Record<string, unknown> = {}): void {
  voiceLogger.info(event, meta);
}

/**
 * voice warn
 *
 * @param event - 
 * @param meta - 
 * @returns void
 */
export function voiceWarn(event: string, meta: Record<string, unknown> = {}): void {
  voiceLogger.warn(event, meta);
}

/**
 * voice error
 *
 * @param event - 
 * @param error - 
 * @param meta - 
 * @returns void
 */
export function voiceError(event: string, error: unknown, meta: Record<string, unknown> = {}): void {
  voiceLogger.error(error, { event, ...meta });
}

/**
 * 创建 module logger
 *
 * @param tag - 
 * @returns 
 */
export function createModuleLogger(tag: string) {
  return createConsola({
    reporters: [SANITIZE_REPORTER as any],
  }).withTag(tag);
}
