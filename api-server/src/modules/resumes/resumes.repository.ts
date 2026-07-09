import { createHash } from "node:crypto";

export interface ResumeRow {
  id: string;
  user_id: string;
  file_name: string;
  file_size: number | null;
  file_hash: string;
  parsed_text: string;
  analysis: Record<string, unknown> | null;
  created_at: string;
}

/** 根据用户 ID 列出所有简历（降序） */
export async function listResumes(
  supabase: any,
  userId: string,
): Promise<ResumeRow[]> {
  const { data, error } = await supabase
    .from("resumes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** 根据 ID 获取单份简历 */
export async function getResumeById(
  supabase: any,
  id: string,
): Promise<ResumeRow | null> {
  const { data, error } = await supabase
    .from("resumes")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

/** 根据 user_id + file_hash 查找是否已存在（去重） */
export async function findResumeByHash(
  supabase: any,
  userId: string,
  hash: string,
): Promise<ResumeRow | null> {
  const { data, error } = await supabase
    .from("resumes")
    .select("*")
    .eq("user_id", userId)
    .eq("file_hash", hash)
    .maybeSingle();

  if (error) return null;
  return data;
}

/** 插入新简历记录 */
export async function insertResume(
  supabase: any,
  row: {
    user_id: string;
    file_name: string;
    file_size: number;
    file_hash: string;
    parsed_text: string;
    analysis: Record<string, unknown> | null;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("resumes")
    .insert(row)
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

/** 删除简历 */
export async function deleteResumeById(
  supabase: any,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("resumes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** 计算 SHA-256 哈希 */
export function computeFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
