/** Agent readiness feature 的脱敏只读 API 客户端。 */
import {apiRequest} from "@/shared/api/http-client";
import type {AgentReadinessInput,AgentReadinessResponse} from "./types";

/**
 * 获取当前创建方案的服务可用性。
 *
 * @param input - 会影响能力检查的交互、模型与研究选项。
 * @returns 后端聚合的 readiness 状态。
 */
export function getAgentReadiness(input:AgentReadinessInput):Promise<AgentReadinessResponse>{
  const query=new URLSearchParams({interviewMode:input.interviewMode,modelProvider:input.modelProvider,webResearch:String(input.webResearch)});
  return apiRequest("GET",`/api/agent/readiness?${query.toString()}`);
}
