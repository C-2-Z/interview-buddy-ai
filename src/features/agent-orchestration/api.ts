/** Agent Orchestration API：读取用户可见且不含思维链的活动。 */
import { apiRequest } from "@/shared/api/http-client";
import type { AgentActivitiesResponse } from "./types";

/** 获取指定会话最近的规划、工具、反思和记忆活动。 */
export function getAgentActivities(sessionId: string): Promise<AgentActivitiesResponse> {
  return apiRequest("GET", `/api/agent/sessions/${sessionId}/activities`);
}
