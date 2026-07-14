/** Agent Memory HTTP 输入与数据库摘要的 Zod 校验。 */
import { z } from "zod";

/** 更新全局记忆授权的请求体。 */
export const UpdateAgentMemorySchema = z.object({ enabled: z.boolean() }).strict();

/** 数据库中只允许保存聚合指标和维度键。 */
export const AgentTrainingSummarySchema = z.object({
  dimensions: z.record(z.object({
    score: z.number().int().min(0).max(100),
    sampleCount: z.number().int().positive(),
  }).strict()),
  recurringWeaknesses: z.array(z.string().trim().min(1).max(100)).max(20),
  suggestedFocus: z.array(z.string().trim().min(1).max(100)).max(20),
  completedSessionCount: z.number().int().min(0),
}).strict();

/** 更新记忆授权的已校验输入。 */
export type UpdateAgentMemoryInput = z.infer<typeof UpdateAgentMemorySchema>;
