/** Interview lifecycle API：调用独立后端模块，不触碰旧面试写状态机。 */
import { apiRequest } from "@/shared/api/http-client";
import type {
  InterviewDeleteResult,
  InterviewLifecycleAction,
  InterviewLifecycleResult,
} from "./types";

/** 提交暂停、恢复、提前结束或放弃动作。 */
export function transitionInterviewSession(
  sessionId: string,
  action: InterviewLifecycleAction,
): Promise<InterviewLifecycleResult> {
  return apiRequest("POST", `/api/agent/sessions/${sessionId}/lifecycle`, { action });
}

/** 删除整场面试及其全部业务投影。 */
export function deleteInterviewSession(sessionId: string): Promise<InterviewDeleteResult> {
  return apiRequest("DELETE", `/api/agent/sessions/${sessionId}`);
}
