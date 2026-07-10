import { getAccessToken } from "@/shared/api/auth-token";
import { apiRequest } from "@/shared/api/http-client";
import type { ResumeDetail, ResumeListItem, ResumeUploadResult } from "./types";

const baseUrl = import.meta.env.VITE_API_URL || "";

export function listResumes(): Promise<ResumeListItem[]> {
  return apiRequest("GET", "/api/resumes");
}

export function getResume(resumeId: string): Promise<ResumeDetail> {
  return apiRequest("GET", `/api/resumes/${resumeId}`);
}

export function deleteResume(resumeId: string): Promise<{ success: true }> {
  return apiRequest("DELETE", `/api/resumes/${resumeId}`);
}

export async function uploadResume(file: File): Promise<ResumeUploadResult> {
  const token = await getAccessToken();
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${baseUrl}/api/resumes`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body,
  });
  if (!response.ok) {
    let message = `上传失败 (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      message = data.error ?? message;
    } catch {
      // Use the status fallback.
    }
    throw new Error(message);
  }
  return response.json() as Promise<ResumeUploadResult>;
}
