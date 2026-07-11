/** 语音面试：WebSocket 会话、音频控制 - API 调用函数 */
import { apiRequest } from "@/shared/api/http-client";
import type { CreateSessionParams } from "@/features/interview-create/types";
import type { QuestionItem, SessionDetail } from "@/features/interview-session/types";
import type { VoiceMessage } from "./types";

export type VoiceConnectResponse = {
  token: string;
  wsUrl: string;
  expiresAt: string;
};

/**
 * 创建 voice interview session
 * @returns
 */
export function createVoiceInterviewSession(
  params: CreateSessionParams,
): Promise<{ sessionId: string }> {
  return apiRequest("POST", "/api/voice/sessions", params);
}

/**
 * 获取 voice session
 * @returns
 */
export function getVoiceSession(
  sessionId: string,
): Promise<{ session: SessionDetail; questions: QuestionItem[] }> {
  return apiRequest("GET", `/api/voice/sessions/${sessionId}`);
}

/**
 * 连接 voice session
 * @returns
 */
export function connectVoiceSession(
  sessionId: string,
): Promise<VoiceConnectResponse> {
  return apiRequest("POST", `/api/voice/sessions/${sessionId}/connect`);
}

/**
 * 列出 voice messages
 * @returns
 */
export function listVoiceMessages(
  sessionId: string,
): Promise<{ messages: VoiceMessage[] }> {
  return apiRequest("GET", `/api/voice/sessions/${sessionId}/messages`);
}

/**
 * end voice session
 * @returns
 */
export function endVoiceSession(
  sessionId: string,
): Promise<{ overallScore: number; overallFeedback: string }> {
  return apiRequest("POST", `/api/voice/sessions/${sessionId}/end`);
}
