/** 简历业务：上传、解析、AI 分析 */
import { parseResume, isSupportedType } from "../../lib/resume-parser.js";
import { analyzeResume } from "../../lib/resume-analyzer.js";
import {
  listResumes,
  getResumeById,
  findResumeByHash,
  insertResume,
  deleteResumeById,
  computeFileHash,
} from "./resumes.repository.js";

export interface UploadResult {
  id: string;
  fileName: string;
  fileSize: number;
  parsedText: string;
  analysis: Record<string, unknown> | null;
  isDuplicate: boolean;
  createdAt: string;
}

export interface ResumeListItem {
  id: string;
  fileName: string;
  fileSize: number | null;
  analysis: { skills?: string[]; overallAssessment?: string } | null;
  createdAt: string;
}

/** 上传并处理简历：验证 → 去重 → 解析 → AI 分析 → 入库 */
export async function uploadResume(
  supabase: any,
  userId: string,
  file: { buffer: Buffer; originalname: string; mimetype: string },
): Promise<UploadResult> {
  // 1. 检查文件类型
  if (!isSupportedType(file.mimetype, file.originalname)) {
    throw new Error(
      `不支持的文件类型: ${file.mimetype}。支持的格式：PDF、DOCX、TXT、MD`,
    );
  }

  // 2. 计算哈希
  const hash = computeFileHash(file.buffer);

  // 3. 去重检查
  const existing = await findResumeByHash(supabase, userId, hash);
  if (existing) {
    return {
      id: existing.id,
      fileName: existing.file_name,
      fileSize: existing.file_size ?? 0,
      parsedText: existing.parsed_text,
      analysis: existing.analysis as Record<string, unknown> | null,
      isDuplicate: true,
      createdAt: existing.created_at,
    };
  }

  // 4. 解析文档为纯文本
  const { text: parsedText } = await parseResume(
    file.buffer,
    file.mimetype,
    file.originalname,
  );

  // 5. AI 结构化分析
  const analysis = await analyzeResume(parsedText);

  // 6. 入库
  const id = await insertResume(supabase, {
    user_id: userId,
    file_name: file.originalname,
    file_size: file.buffer.length,
    file_hash: hash,
    parsed_text: parsedText,
    analysis: analysis as Record<string, unknown> | null,
  });

  // 7. 获取创建时间
  const saved = await getResumeById(supabase, id);

  return {
    id,
    fileName: file.originalname,
    fileSize: file.buffer.length,
    parsedText,
    analysis: analysis as Record<string, unknown> | null,
    isDuplicate: false,
    createdAt: saved?.created_at ?? new Date().toISOString(),
  };
}

/** 获取用户的所有简历 */
export async function getUserResumes(
  supabase: any,
  userId: string,
): Promise<ResumeListItem[]> {
  const rows = await listResumes(supabase, userId);
  return rows.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    fileSize: r.file_size,
    analysis: r.analysis as { skills?: string[]; overallAssessment?: string } | null,
    createdAt: r.created_at,
  }));
}

/** 获取单份简历详情 */
export async function getResume(
  supabase: any,
  id: string,
): Promise<UploadResult | null> {
  const row = await getResumeById(supabase, id);
  if (!row) return null;
  return {
    id: row.id,
    fileName: row.file_name,
    fileSize: row.file_size ?? 0,
    parsedText: row.parsed_text,
    analysis: row.analysis as Record<string, unknown> | null,
    isDuplicate: false,
    createdAt: row.created_at,
  };
}

/** 删除简历 */
export async function deleteResume(supabase: any, id: string): Promise<void> {
  await deleteResumeById(supabase, id);
}
