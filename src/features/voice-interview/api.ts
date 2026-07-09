import { apiRequest } from "@/shared/api/http-client";
import type { VoiceMessage } from "./types";

export type VoiceConnectResponse = {
  token: string;
  wsUrl: string;
  expiresAt: string;
};

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
