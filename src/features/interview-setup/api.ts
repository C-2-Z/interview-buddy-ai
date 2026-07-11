/** 面试设置：Skill 选择 - API 调用函数 */
import { createInterviewSession, listSkills } from "@/features/interview-create/api";
import { getSession } from "@/features/interview-session/api";
import { createVoiceInterviewSession } from "@/features/voice-interview/api";
import { apiRequest } from "@/shared/api/http-client";
import type { CreateSessionParams } from "@/features/interview-create/types";
import type { SetupResume } from "./types";

export { getSession, listSkills };

/**
 * 获取 setup 恢复
 *
 * @param resumeId - 
 * @returns 
 */
export function getSetupResume(resumeId: string): Promise<SetupResume> {
  return apiRequest("GET", `/api/resumes/${resumeId}`);
}

/**
 * 创建 configured interview
 * @returns 
 */
export function createConfiguredInterview(
  mode: "text" | "voice",
  params: CreateSessionParams,
): Promise<{ sessionId: string }> {
  return mode === "voice" ? createVoiceInterviewSession(params) : createInterviewSession(params);
}
