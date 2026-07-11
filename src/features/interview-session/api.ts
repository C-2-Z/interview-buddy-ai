/** 面试会话：对话面板、状态管理 - API 调用函数 */
import { apiRequest } from "@/shared/api/http-client";
import type { QuestionItem, SessionDetail, SessionItem } from "./types";

/**
 * 列出 sessions
 * @returns 
 */
export function listSessions(): Promise<SessionItem[]> {
  return apiRequest("GET", "/api/sessions");
}

/**
 * 获取 session
 * @returns 
 */
export function getSession(
  sessionId: string,
): Promise<{ session: SessionDetail; questions: QuestionItem[] }> {
  return apiRequest("GET", `/api/sessions/${sessionId}`);
}

/**
 * 结束 session
 * @returns 
 */
export function finishSession(
  sessionId: string,
): Promise<{ overallScore: number; overallFeedback: string }> {
  return apiRequest("POST", `/api/sessions/${sessionId}/finish`);
}

/**
 * 发送 message
 * @returns 
 */
export function sendMessage(
  questionId: string,
  content: string,
): Promise<{ response: string; done?: boolean; score?: number; feedback?: string }> {
  return apiRequest("POST", `/api/questions/${questionId}/message`, { content });
}

/**
 * 评估 conversation
 * @returns 
 */
export function evaluateConversation(
  questionId: string,
): Promise<{ score: number; feedback: string }> {
  return apiRequest("POST", `/api/questions/${questionId}/evaluate`);
}

