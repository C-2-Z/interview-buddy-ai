import { apiRequest } from "@/shared/api/http-client";
import type { CreateSessionParams, SkillMeta } from "./types";

export function createInterviewSession(
  params: CreateSessionParams,
): Promise<{ sessionId: string }> {
  return apiRequest("POST", "/api/sessions", params);
}

export function listSkills(): Promise<SkillMeta[]> {
  return apiRequest("GET", "/api/skills");
}

