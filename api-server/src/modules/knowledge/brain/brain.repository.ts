// @ts-nocheck - 新表类型定义在 supabase-types.ts 中尚未生成（需先在 Supabase 中执行 migration）
/** 知识库 Brain 模块：Supabase 数据库访问 */

import type { UserSupabaseClient } from "../../../shared/db/supabase.js";
import type { Brain, BrainCreateInput, BrainUpdateInput } from "./brain.types.js";

// ============================================================
// Brain CRUD
// ============================================================

/** 创建知识库 */
export async function createBrain(
  supabase: UserSupabaseClient,
  userId: string,
  input: BrainCreateInput,
): Promise<Brain> {
  const { data, error } = await supabase
    .from("knowledge_brains")
    .insert({
      user_id: userId,
      name: input.name,
      description: input.description ?? "",
      system_prompt: input.systemPrompt ?? null,
      embedding_provider: input.embeddingProvider ?? "dashscope",
    })
    .select("*")
    .single();
  if (error) throw new Error(`创建知识库失败: ${error.message}`);
  return mapBrainRow(data);
}

/** 获取用户的所有知识库 */
export async function listBrains(supabase: UserSupabaseClient, userId: string): Promise<Brain[]> {
  const { data, error } = await supabase
    .from("knowledge_brains")
    .select(
      `
      *,
      document_count:knowledge_brain_documents(count)
    `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`获取知识库列表失败: ${error.message}`);
  return (data ?? []).map(mapBrainRow);
}

/** 获取单个知识库 */
export async function getBrain(
  supabase: UserSupabaseClient,
  brainId: string,
): Promise<Brain | null> {
  const { data, error } = await supabase
    .from("knowledge_brains")
    .select(
      `
      *,
      document_count:knowledge_brain_documents(count)
    `,
    )
    .eq("id", brainId)
    .single();
  if (error) return null;
  return mapBrainRow(data);
}

/** 更新知识库 */
export async function updateBrain(
  supabase: UserSupabaseClient,
  brainId: string,
  input: BrainUpdateInput,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description;
  if (input.systemPrompt !== undefined) update.system_prompt = input.systemPrompt;
  const { error } = await supabase.from("knowledge_brains").update(update).eq("id", brainId);
  if (error) throw new Error(`更新知识库失败: ${error.message}`);
}

/** 删除知识库（CASCADE 会自动删除关联记录）*/
export async function deleteBrain(supabase: UserSupabaseClient, brainId: string): Promise<void> {
  const { error } = await supabase.from("knowledge_brains").delete().eq("id", brainId);
  if (error) throw new Error(`删除知识库失败: ${error.message}`);
}

/** 确保用户有默认知识库（不存在则自动创建）*/
export async function ensureDefaultBrain(
  supabase: UserSupabaseClient,
  userId: string,
): Promise<Brain> {
  // 查找已有知识库
  const { data: existing } = await supabase
    .from("knowledge_brains")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (existing && existing.length > 0) {
    return mapBrainRow(existing[0]);
  }

  // 自动创建默认知识库
  return createBrain(supabase, userId, { name: "默认知识库", description: "自动创建的默认知识库" });
}

// ============================================================
// Brain-Document 关联
// ============================================================

/** 获取知识库关联的文档 ID 列表 */
export async function getBrainDocumentIds(
  supabase: UserSupabaseClient,
  brainId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("knowledge_brain_documents")
    .select("document_id")
    .eq("brain_id", brainId);
  if (error) throw new Error(`获取知识库文档列表失败: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => r.document_id as string);
}

/** 将文档关联到知识库 */
export async function addDocumentsToBrain(
  supabase: UserSupabaseClient,
  brainId: string,
  documentIds: string[],
): Promise<void> {
  if (documentIds.length === 0) return;
  const rows = documentIds.map((docId) => ({
    brain_id: brainId,
    document_id: docId,
  }));
  const { error } = await supabase.from("knowledge_brain_documents").upsert(rows, {
    onConflict: "brain_id, document_id",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`关联文档失败: ${error.message}`);
}

/** 从知识库移除文档 */
export async function removeDocumentFromBrain(
  supabase: UserSupabaseClient,
  brainId: string,
  documentId: string,
): Promise<void> {
  const { error } = await supabase
    .from("knowledge_brain_documents")
    .delete()
    .eq("brain_id", brainId)
    .eq("document_id", documentId);
  if (error) throw new Error(`移除文档失败: ${error.message}`);
}

// ============================================================
// Mapper
// ============================================================

function mapBrainRow(row: Record<string, unknown>): Brain {
  const docCount = row.document_count
    ? typeof row.document_count === "number"
      ? row.document_count
      : ((row.document_count as Record<string, unknown>)?.count ?? 0)
    : 0;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    systemPrompt: (row.system_prompt as string) ?? null,
    embeddingProvider: (row.embedding_provider as string) ?? "dashscope",
    documentCount: Number(docCount),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
