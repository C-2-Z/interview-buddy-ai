/** Interview report API：读取 Agent 已持久化的报告、题目、证据与评分投影。 */
import { apiRequest } from "@/shared/api/http-client";
import type { InterviewReport } from "./types";

/** 获取当前用户拥有的面试报告投影。 */
export function getInterviewReport(sessionId: string): Promise<InterviewReport> {
  return apiRequest("GET", `/api/agent/sessions/${sessionId}/workspace`);
}
