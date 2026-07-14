/** Agent Memory API：管理用户主动授权的聚合训练摘要。 */
import { apiRequest } from "@/shared/api/http-client";
import type { AgentMemoryView } from "./types";

/** 读取当前训练记忆授权和摘要。 */
export function getAgentMemory(): Promise<AgentMemoryView> {
  return apiRequest("GET", "/api/agent/memory");
}

/** 修改全局训练记忆授权；后端会在每次读取和写入时重新检查。 */
export function updateAgentMemory(enabled: boolean): Promise<AgentMemoryView> {
  return apiRequest("PATCH", "/api/agent/memory", { enabled });
}

/** 清除聚合训练摘要，但保留原始面试报告。 */
export function clearAgentMemory(): Promise<AgentMemoryView> {
  return apiRequest("DELETE", "/api/agent/memory");
}
