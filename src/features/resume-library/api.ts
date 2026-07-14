/** 简历库浏览/上传/删除 - API 调用函数 */
import { ApiRequestError, apiRequest, apiUpload } from "@/shared/api/http-client";
import type { ResumeDetail, ResumeListItem, ResumeUploadResult } from "./types";

/**
 * 列出 resumes
 * @returns
 */
export function listResumes(): Promise<ResumeListItem[]> {
  return apiRequest("GET", "/api/resumes");
}

/**
 * 获取 恢复
 *
 * @param resumeId -
 * @returns
 */
export function getResume(resumeId: string): Promise<ResumeDetail> {
  return apiRequest("GET", `/api/resumes/${resumeId}`);
}

/**
 * 删除 恢复
 *
 * @param resumeId -
 * @returns
 */
export function deleteResume(resumeId: string): Promise<{ success: true }> {
  return apiRequest("DELETE", `/api/resumes/${resumeId}`);
}

/**
 * 上传 恢复
 *
 * @param file -
 * @returns Promise<
 */
export async function uploadResume(file: File): Promise<ResumeUploadResult> {
  const body = new FormData();
  body.append("file", file);
  try {
    return await apiUpload<ResumeUploadResult>("/api/resumes", body);
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === "request_failed") {
      throw new Error(`上传失败 (${error.status})`);
    }
    throw error;
  }
}
