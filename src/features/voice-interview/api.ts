import { apiRequest } from "@/shared/api/http-client";
import type { CreateSessionParams } from "@/features/interview-create/types";
import type { QuestionItem, SessionDetail } from "@/features/interview-session/types";
import type { VoiceMessage } from "./types";

export type VoiceConnectResponse = {
  token: string;
  wsUrl: string;
  expiresAt: string;
};

export function createVoiceInterviewSession(
  params: CreateSessionParams,
): Promise<{ sessionId: string }> {
  return apiRequest("POST", "/api/voice/sessions", params);
}

export function getVoiceSession(
  sessionId: string,
): Promise<{ session: SessionDetail; questions: QuestionItem[] }> {
  return apiRequest("GET", `/api/voice/sessions/${sessionId}`);
}

export function connectVoiceSession(
  sessionId: string,
): Promise<VoiceConnectResponse> {
  return apiRequest("POST", `/api/voice/sessions/${sessionId}/connect`);
}

export function listVoiceMessages(
  sessionId: string,
): Promise<{ messages: VoiceMessage[] }> {
  return apiRequest("GET", `/api/voice/sessions/${sessionId}/messages`);
}

export function endVoiceSession(
  sessionId: string,
): Promise<{ overallScore: number; overallFeedback: string }> {
  return apiRequest("POST", `/api/voice/sessions/${sessionId}/end`);
}
