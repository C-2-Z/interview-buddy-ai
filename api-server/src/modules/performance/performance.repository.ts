export type PerformanceEvent = {
  traceId: string;
  stage: string;
  durationMs: number;
  provider?: string;
  model?: string;
  outcome: "ok" | "error" | "cancelled";
};

export function writePerformanceEvent(event: PerformanceEvent): void {
  const sampleRate = Math.max(0, Math.min(1, Number(process.env.PERFORMANCE_SAMPLE_RATE || "1")));
  if (event.outcome === "ok" && Math.random() > sampleRate) return;
  console.info("[performance]", JSON.stringify(event));
}
