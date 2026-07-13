/** Interview lifecycle 输入输出校验：拒绝未知动作和畸形数据库投影。 */
import { z } from "zod";

/** 路径中的 Agent 会话参数。 */
export const InterviewLifecycleParamsSchema = z
  .object({ sessionId: z.string().uuid() })
  .strict();

/** 生命周期动作请求体。 */
export const InterviewLifecycleActionSchema = z
  .object({
    action: z.enum(["pause", "resume", "finish", "abandon"]),
  })
  .strict();

/** 数据库生命周期 RPC 的最小安全响应。 */
export const InterviewLifecycleResultSchema = z
  .object({
    sessionId: z.string().uuid(),
    status: z.enum(["in_progress", "paused", "completed", "abandoned", "failed"]),
    reportAvailable: z.boolean(),
    evaluatedQuestionCount: z.number().int().min(0),
    totalQuestionCount: z.number().int().min(1),
  })
  .strict();

/** 数据库删除 RPC 的最小安全响应。 */
export const InterviewDeleteRpcResultSchema = z
  .object({
    sessionId: z.string().uuid(),
    threadId: z.string().min(1).max(200),
    deleted: z.literal(true),
  })
  .strict();
