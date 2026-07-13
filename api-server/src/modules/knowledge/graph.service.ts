/** 知识库：反链计算 + 图谱数据组装服务 */

import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { createModuleLogger } from "../../shared/logger/voice-logger.js";
import { getAllChunkEmbeddings } from "./knowledge.repository.js";
import {
  insertGraphEdges,
  deleteEdgesByDocument,
  deleteAllEdgesByUser,
  assembleGraphData,
  getBacklinks,
} from "./graph.repository.js";
import type { GraphData, BacklinkDetail } from "./knowledge.types.js";

const logger = createModuleLogger("knowledge-graph");

/** 反链计算阈值 */
const DEFAULT_MIN_SIMILARITY = 0.7;
const DEFAULT_TOP_K = 10;

/** 文档上传后触发：为新文档的所有 chunks 计算反链
 *  遍历每个新 chunk 的 embedding，对整个用户知识库做向量检索，
 *  过滤相似度 >0.7 的配对，存入 knowledge_graph_edges
 *  @param documentId - 新上传的文档 ID */
export async function buildGraphEdgesForDocument(
  supabase: UserSupabaseClient,
  userId: string,
  documentId: string,
): Promise<number> {
  logger.info(`开始构建图边: documentId=${documentId}`);

  // 1. 删除该文档旧图边
  await deleteEdgesByDocument(supabase, documentId);

  // 2. 获取该文档的所有 chunks（含 embedding）
  const chunks = await getAllChunkEmbeddings(supabase, userId, [documentId]);
  if (chunks.length === 0) {
    logger.info(`文档无 chunks，跳过图边构建`);
    return 0;
  }

  // 3. 获取用户所有其他 chunks（排除当前文档）
  const allChunks = await getAllChunkEmbeddings(supabase, userId);
  const otherChunks = allChunks.filter((c) => c.documentId !== documentId);

  if (otherChunks.length === 0) {
    logger.info(`无其他 chunks，跳过图边构建`);
    return 0;
  }

  // 4. 对每个新 chunk，计算与其他 chunks 的余弦相似度
  const edges: Array<{
    sourceChunkId: string;
    targetChunkId: string;
    similarity: number;
    userId: string;
  }> = [];

  for (const newChunk of chunks) {
    const scored = otherChunks.map((other) => ({
      chunkId: other.id,
      similarity: cosineSimilarity(newChunk.embedding, other.embedding),
    }));

    scored.sort((a, b) => b.similarity - a.similarity);
    const topMatches = scored
      .filter((s) => s.similarity >= DEFAULT_MIN_SIMILARITY)
      .slice(0, DEFAULT_TOP_K);

    for (const match of topMatches) {
      // 规范化方向：source < target 确保唯一性
      const [src, tgt] = [newChunk.id, match.chunkId].sort();
      edges.push({
        sourceChunkId: src,
        targetChunkId: tgt,
        similarity: match.similarity,
        userId,
      });
    }
  }

  // 5. 批量插入图边
  if (edges.length > 0) {
    await insertGraphEdges(supabase, edges);
  }

  logger.info(`图边构建完成: ${edges.length} 条`);
  return edges.length;
}

/** 全量重建所有图边 */
export async function rebuildAllGraphEdges(
  supabase: UserSupabaseClient,
  userId: string,
): Promise<number> {
  logger.info("开始全量重建图边");

  // 1. 删除所有旧图边
  await deleteAllEdgesByUser(supabase, userId);

  // 2. 获取所有 chunks
  const allChunks = await getAllChunkEmbeddings(supabase, userId);
  if (allChunks.length === 0) return 0;

  // 3. 两两计算相似度（优化：只计算每个 chunk 的 top-k）
  const edges: Array<{
    sourceChunkId: string;
    targetChunkId: string;
    similarity: number;
    userId: string;
  }> = [];
  const existingPairs = new Set<string>();

  for (const chunk of allChunks) {
    const others = allChunks.filter((c) => c.id !== chunk.id);
    const scored = others.map((other) => ({
      chunkId: other.id,
      similarity: cosineSimilarity(chunk.embedding, other.embedding),
    }));

    scored.sort((a, b) => b.similarity - a.similarity);
    const topMatches = scored
      .filter((s) => s.similarity >= DEFAULT_MIN_SIMILARITY)
      .slice(0, DEFAULT_TOP_K);

    for (const match of topMatches) {
      const pairKey = [chunk.id, match.chunkId].sort().join(":");
      if (existingPairs.has(pairKey)) continue;
      existingPairs.add(pairKey);
      const [src, tgt] = [chunk.id, match.chunkId].sort();
      edges.push({
        sourceChunkId: src,
        targetChunkId: tgt,
        similarity: match.similarity,
        userId,
      });
    }
  }

  // 4. 批量插入
  if (edges.length > 0) {
    await insertGraphEdges(supabase, edges);
  }

  logger.info(`全量重建完成: ${edges.length} 条`);
  return edges.length;
}

/** 获取图谱数据 */
export async function getGraphData(
  supabase: UserSupabaseClient,
  userId: string,
  options?: { minSimilarity?: number; documentIds?: string[] },
): Promise<GraphData> {
  return assembleGraphData(supabase, userId, {
    minSimilarity: options?.minSimilarity ?? DEFAULT_MIN_SIMILARITY,
    documentIds: options?.documentIds,
  });
}

/** 获取某个 chunk 的反链 */
export async function getBacklinksForChunk(
  supabase: UserSupabaseClient,
  chunkId: string,
  minSimilarity?: number,
): Promise<BacklinkDetail[]> {
  return getBacklinks(supabase, chunkId, minSimilarity ?? DEFAULT_MIN_SIMILARITY);
}

/** 余弦相似度 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
