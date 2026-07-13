/** Agent readiness HTTP 查询参数的 Zod 校验契约。 */
import { z } from "zod";

/** 创建方案中会改变 readiness 结论的安全查询参数。 */
export const AgentReadinessQuerySchema = z
  .object({
    interviewMode: z.enum(["text", "voice"]).default("text"),
    modelProvider: z.enum(["deepseek", "openai", "anthropic"]).optional(),
    webResearch: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .default("true"),
  })
  .strict();

/** 已校验的 readiness 查询参数。 */
export type AgentReadinessQuery = z.infer<typeof AgentReadinessQuerySchema>;
