import { apiRequest } from "@/shared/api/http-client";
import { getAccessToken } from "@/shared/api/auth-token";
import type { CreateSessionParams, SkillMeta } from "./types";

const baseUrl = import.meta.env.VITE_API_URL || "";

export interface UploadResumeResult {
  id: string;
  parsedText: string;
}

export function createInterviewSession(
  params: CreateSessionParams,
): Promise<{ sessionId: string }> {
  return apiRequest("POST", "/api/sessions", params);
}

export function listSkills(): Promise<SkillMeta[]> {
  return apiRequest("GET", "/api/skills");
}

export async function uploadResumeFile(
  file: File,
): Promise<UploadResumeResult> {
  const token = await getAccessToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${baseUrl}/api/resumes`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) {
    throw new Error("简历解析失败");
  }
  return res.json();
}
