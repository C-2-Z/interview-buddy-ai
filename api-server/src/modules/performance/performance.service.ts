/** 性能模块：创建追踪标识并测量业务阶段耗时。 */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  resolvePerformanceSampleRate,
  writePerformanceEvent,
  type PerformanceEvent,
} from "./performance.repository.js";

/** 创建仅用于日志关联的随机追踪 ID。 */
export function createTraceId(prefix = "trace"): string {
  return `${prefix}-${randomUUID()}`;
}

/** 开始测量业务阶段，并返回用于提交最终结果的闭包。 */
export function startPerformanceSpan(
  stage: string,
  meta: Omit<PerformanceEvent, "stage" | "durationMs" | "outcome">,
): (outcome?: PerformanceEvent["outcome"]) => void {
  const startedAt = performance.now();
  return (outcome: PerformanceEvent["outcome"] = "ok") => {
    writePerformanceEvent({
      ...meta,
      stage,
      outcome,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
  };
}

/** 返回性能观测开关与当前采样率，供健康检查使用。 */
export function getPerformanceStatus(): { enabled: true; sampleRate: number } {
  return { enabled: true, sampleRate: resolvePerformanceSampleRate() };
}
