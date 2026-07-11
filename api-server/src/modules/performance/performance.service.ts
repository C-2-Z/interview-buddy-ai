import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { writePerformanceEvent, type PerformanceEvent } from "./performance.repository.js";

export function createTraceId(prefix = "trace"): string {
  return `${prefix}-${randomUUID()}`;
}

export function startPerformanceSpan(
  stage: string,
  meta: Omit<PerformanceEvent, "stage" | "durationMs" | "outcome">,
) {
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
