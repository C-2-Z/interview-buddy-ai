/** 知识库：向量检索服务 — 将用户问题转换为 embedding 后进行相似度搜索 */

import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { generateQueryEmbedding } from "./embedding.service.js";
import { vectorSearch } from "./knowledge.repository.js";
import type { SearchResult } from "./knowledge.types.js";

/** 搜索配置 */
const DEFAULT_TOP_K = 5;

/** 检索知识库，返回最相关的 chunks
 *  @param query - 用户提问或搜索关键词
 *  @param documentIds - 可选，限定搜索范围到指定文档
 *  @param topK - 返回结果数量 */
export async function searchKnowledge(
  supabase: UserSupabaseClient,
  userId: string,
  query: string,
  options?: { documentIds?: string[]; topK?: number },
): Promise<SearchResult[]> {
  const topK = options?.topK ?? DEFAULT_TOP_K;

  // 1. 将查询转换为 embedding
  const embedding = await generateQueryEmbedding(query);

  // 2. 向量搜索
  const results = await vectorSearch(supabase, userId, embedding, {
    topK,
    documentIds: options?.documentIds,
  });

  return results;
}

/** 为 AI prompt 构建上下文文本（将搜索结果拼接为可注入的上下文）
 *  @param results - 搜索结果
 *  @param maxChars - 最大字符数 */

/** 为 QA 回答构建带引用信息的 context（用于 cited_chunks 记录） */
export function buildCitedChunks(results: SearchResult[]): Array<{
  chunkId: string;
  documentId: string;
  content: string;
  similarity: number;
}> {
  return results.map((r) => ({
    chunkId: r.chunkId,
    documentId: r.documentId,
    content: r.content,
    similarity: r.similarity,
  }));
}
