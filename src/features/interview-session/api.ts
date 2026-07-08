import { apiRequest } from "@/shared/api/http-client";
import type { QuestionItem, SessionDetail, SessionItem } from "./types";

export function listSessions(): Promise<SessionItem[]> {
  return apiRequest("GET", "/api/sessions");
}

export function getSession(
  sessionId: string,
): Promise<{ session: SessionDetail; questions: QuestionItem[] }> {
  return apiRequest("GET", `/api/sessions/${sessionId}`);
}

export function finishSession(
  sessionId: string,
): Promise<{ overallScore: number; overallFeedback: string }> {
  return apiRequest("POST", `/api/sessions/${sessionId}/finish`);
}

export function sendMessage(
  questionId: string,
  content: string,
): Promise<{ response: string; done?: boolean; score?: number; feedback?: string }> {
  return apiRequest("POST", `/api/questions/${questionId}/message`, { content });
}

export function evaluateConversation(
  questionId: string,
): Promise<{ score: number; feedback: string }> {
  return apiRequest("POST", `/api/questions/${questionId}/evaluate`);
}

