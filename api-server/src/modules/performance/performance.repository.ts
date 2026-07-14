/** 性能模块：采样并写入结构化阶段耗时日志。 */
import { createModuleLogger } from "../../shared/logger/voice-logger.js";
import { PerformanceEventSchema, type PerformanceEvent } from "./performance.schemas.js";

const logger = createModuleLogger("performance");

/** 读取并钳制性能日志采样率，防止错误环境变量扩大日志量。 */
export function resolvePerformanceSampleRate(): number {
  return Math.max(0, Math.min(1, Number(process.env.PERFORMANCE_SAMPLE_RATE || "1")));
}

/** 按采样率写入经过校验的性能事件，错误和取消事件始终保留。 */
export function writePerformanceEvent(event: PerformanceEvent): void {
  const safeEvent = PerformanceEventSchema.parse(event);
  if (safeEvent.outcome === "ok" && Math.random() > resolvePerformanceSampleRate()) return;
  logger.info("stage_completed", safeEvent);
}

export type { PerformanceEvent };
