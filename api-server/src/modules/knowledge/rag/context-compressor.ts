/**
 * 知识库 RAG 模块：Context Compression — 按 Token 预算裁剪和压缩检索结果
 * 确保注入 AI 的上下文不超出模型限制，优先保留高相似度的内容
 */

import { createModuleLogger } from "../../voice/voice-logger.js";
import type { SearchResult } from "../knowledge.types.js";

const logger = createModuleLogger("rag-compressor");

/** 压缩配置 */
interface CompressConfig {
  /** 最大字符数（默认 4000）*/
  maxChars: number;
  /** 单个 chunk 最长字符数（超出部分截断）*/
  maxChunkChars: number;
  /** 保留结果最大数量 */
  maxResults: number;
  /** 相似度下限（低于此值的结果被丢弃）*/
  minSimilarity: number;
}

const DEFAULT_CONFIG: CompressConfig = {
  maxChars: 4000,
  maxChunkChars: 1000,
  maxResults: 10,
  minSimilarity: 0.0,
};

/** 压缩检索结果：按相似度排序 → 过滤低分 → 截断长 chunk → 直到不超过 maxChars
 *  @param results - 原始搜索结果
 *  @param config - 压缩配置（可选）
 *  @returns 压缩后的上下文文本 + 压缩后的搜索结果的元数据 */
export function compressResults(
  results: SearchResult[],
  config: Partial<CompressConfig> = {},
): {
  context: string;
  compressedResults: SearchResult[];
} {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (results.length === 0) {
    return { context: "", compressedResults: [] };
  }

  // 1. 按相似度降序排列
  const sorted = [...results].sort((a, b) => b.similarity - a.similarity);

  // 2. 过滤低分结果
  const filtered = sorted.filter((r) => r.similarity >= cfg.minSimilarity);

  // 无结果超过阈值时，仍保留 Top 3 最高相似度结果（保证 AI 有上下文可参考）
  const fallbackResults = filtered.length > 0 ? filtered : sorted.slice(0, 3);
  if (filtered.length === 0) {
    logger.info("所有结果低于相似度阈值，但仍保留 Top 3 作为上下文");
  }

  // 3. 截断长 chunk
  const truncated = fallbackResults.map((r) => ({
    ...r,
    content: r.content.length > cfg.maxChunkChars
      ? r.content.slice(0, cfg.maxChunkChars) + "...(截断)"
      : r.content,
  }));

  // 4. 按 token 预算填充，取 top N
  let totalChars = 0;
  const kept: SearchResult[] = [];
  const header = "以下是与用户问题相关的参考资料（来自知识库）：\n\n";
  totalChars = header.length;

  for (let i = 0; i < truncated.length && kept.length < cfg.maxResults; i++) {
    const r = truncated[i];
    const entry = `[${i + 1}] 来自《${r.documentTitle}》\n${r.content}\n\n`;
    if (totalChars + entry.length > cfg.maxChars) break;
    kept.push(r);
    totalChars += entry.length;
  }

  const context = kept.length > 0 ? header + kept.map((r, i) => `[${i + 1}] 来自《${r.documentTitle}》\n${r.content}`).join("\n\n") : "";

  logger.info(`上下文压缩完成: ${results.length} → ${kept.length} 条, ${totalChars} 字符`);

  return { context, compressedResults: kept };
}

/** 估算 token 数（用于日志和预算检查）*/
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** 构建压缩后的 citedChunks（与 compressedResults 对齐）*/
export function buildCompressedCitedChunks(
  results: SearchResult[],
): Array<{
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
