/** 性能模块：运行阶段事件的结构与边界校验。 */
import { z } from "zod";

/** 约束写入日志的性能事件，避免无界字符串或非法耗时污染观测数据。 */
export const PerformanceEventSchema = z.object({
  traceId: z.string().min(1).max(100),
  stage: z.string().min(1).max(80),
  durationMs: z.number().nonnegative(),
  provider: z.string().max(40).optional(),
  model: z.string().max(100).optional(),
  outcome: z.enum(["ok", "error", "cancelled"]),
});

/** 经过性能事件 Schema 约束的日志载荷。 */
export type PerformanceEvent = z.infer<typeof PerformanceEventSchema>;
