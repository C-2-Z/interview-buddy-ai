/** Agent Canonical API client using shared http-client. */
import { apiRequest } from "@/shared/api/http-client";
import type { AgentSessionView, AgentInputBody, CreateAgentSessionBody, CreateAgentSessionResponse } from "./types";

export function createAgentSession(body: CreateAgentSessionBody): Promise<CreateAgentSessionResponse> {
  return apiRequest("POST", "/api/agent/sessions", body);
}

export function getAgentSession(sessionId: string): Promise<AgentSessionView> {
  return apiRequest("GET", "/api/agent/sessions/" + sessionId);
}

export function submitAgentInput(sessionId: string, input: AgentInputBody): Promise<{ duplicate: boolean; snapshot: import("./types").AgentSnapshot }> {
  return apiRequest("POST", "/api/agent/sessions/" + sessionId + "/input", input);
}

export function interruptAgentSession(sessionId: string): Promise<{ accepted: boolean }> {
  return apiRequest("POST", "/api/agent/sessions/" + sessionId + "/interrupt");
}

export function finishAgentSession(sessionId: string): Promise<AgentSessionView> {
  return apiRequest("POST", "/api/agent/sessions/" + sessionId + "/finish");
}

export function retryAgentSession(sessionId: string): Promise<{ duplicate: boolean; snapshot: import("./types").AgentSnapshot }> {
  return apiRequest("POST", "/api/agent/sessions/" + sessionId + "/retry");
}

export function connectAgentEventStream(sessionId: string, lastEventId?: number): EventSource {
  const url = new URL("/api/agent/sessions/" + sessionId + "/events", window.location.origin);
  if (lastEventId != null && lastEventId > 0) {
    url.searchParams.set("lastEventId", String(lastEventId));
  }
  return new EventSource(url.toString());
}
