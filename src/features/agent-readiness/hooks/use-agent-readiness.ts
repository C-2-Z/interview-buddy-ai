/** Agent readiness React Query Hook：缓存所选方案并支持显式重试。 */
import {useQuery} from "@tanstack/react-query";
import {getAgentReadiness} from "../api";
import type {AgentReadinessInput} from "../types";

/**
 * 随创建选项变化重新检查 readiness，短暂缓存可避免重复聚焦触发请求。
 *
 * @param input - 当前创建方案中影响可用性的选项。
 * @returns React Query 的状态、结果与 refetch 动作。
 */
export function useAgentReadiness(input:AgentReadinessInput){
  return useQuery({queryKey:["agent-readiness",input],queryFn:()=>getAgentReadiness(input),staleTime:15_000,retry:1});
}
