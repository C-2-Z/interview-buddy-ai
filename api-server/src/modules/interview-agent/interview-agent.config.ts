/** Interview Agent 服务端功能开关与非敏感运行参数。 */
import { z } from "zod";

/** Agent 运行参数只解析非敏感值；数据库和搜索凭据由各 Provider 按需读取。 */
const AgentRuntimeConfigSchema = z.object({
  enabled: z.boolean(),
  promptVersion: z.string().trim().min(1).max(100),
  webResearchEnabled: z.boolean(),
  eventRetentionDays: z.number().int().min(1).max(3650),
  maxNodeRetries: z.number().int().min(0).max(10),
  webResearchTimeoutMs: z.number().int().min(1000).max(120_000),
});

/** 可安全记录和冻结的 Agent 运行参数。 */
export type AgentRuntimeConfig = z.infer<typeof AgentRuntimeConfigSchema>;

/**
 * 解析常见的环境变量布尔值。
 *
 * @param value - 原始环境变量。
 * @param fallback - 未设置或无法识别时的默认值。
 * @returns 解析后的布尔值。
 */
function environmentBoolean(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  if (["1", "true", "yes", "on"].includes(value.trim().toLowerCase())) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value.trim().toLowerCase())) {
    return false;
  }
  return fallback;
}

/**
 * 解析带上下界的整数环境变量。
 *
 * 非法值交由最终 Zod 校验拒绝，避免悄悄以错误配置启动 Agent 节点。
 *
 * @param value - 原始环境变量。
 * @param fallback - 未设置时的默认整数。
 * @returns 待 Zod 校验的数字。
 */
function environmentInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  return Number(value);
}

/**
 * 读取 Interview Agent 的非敏感运行配置。
 *
 * @returns 已校验且可安全传给业务层的配置。
 */
export function getAgentRuntimeConfig(): AgentRuntimeConfig {
  return AgentRuntimeConfigSchema.parse({
    enabled: environmentBoolean(process.env.AGENT_INTERVIEW_ENABLED, false),
    promptVersion: process.env.AGENT_PROMPT_VERSION?.trim() || "agent-v3-realism-v1",
    webResearchEnabled: environmentBoolean(
      process.env.AGENT_WEB_RESEARCH_ENABLED,
      true,
    ),
    eventRetentionDays: environmentInteger(
      process.env.AGENT_EVENT_RETENTION_DAYS,
      90,
    ),
    maxNodeRetries: environmentInteger(process.env.AGENT_MAX_NODE_RETRIES, 2),
    webResearchTimeoutMs: environmentInteger(
      process.env.AGENT_WEB_RESEARCH_TIMEOUT_MS,
      10_000,
    ),
  });
}

/** 判断灰度闸门是否允许创建新 Agent；关闭时绝不回退旧写流程。 */
export function agentInterviewEnabled():boolean{return getAgentRuntimeConfig().enabled;}
