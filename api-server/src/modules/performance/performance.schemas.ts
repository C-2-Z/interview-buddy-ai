import { z } from "zod";

export const PerformanceEventSchema = z.object({
  traceId: z.string().min(1).max(100),
  stage: z.string().min(1).max(80),
  durationMs: z.number().nonnegative(),
  provider: z.string().max(40).optional(),
  model: z.string().max(100).optional(),
  outcome: z.enum(["ok", "error", "cancelled"]).default("ok"),
});
