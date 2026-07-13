/** 知识库：文档分块服务 — 递归字符分块，800 token / 100 overlap */

/** 分块配置 */
const CHUNK_SIZE = 800;    // 目标 token 数
const OVERLAP = 100;       // 重叠 token 数
const AVG_CHARS_PER_TOKEN = 1.3;  // 中英文混合场景的经验值

/** 单个分块 */
export interface TextChunk {
  content: string;
  index: number;
  tokenCount: number;
}

/** 估算 token 数（粗略近似，用于分块） */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
}

/** 递归字符分块 */
export function chunkText(text: string): TextChunk[] {
  if (!text || text.trim().length === 0) return [];

  const chunks: TextChunk[] = [];
  const chunkCharSize = Math.floor(CHUNK_SIZE * AVG_CHARS_PER_TOKEN);
  const overlapCharSize = Math.floor(OVERLAP * AVG_CHARS_PER_TOKEN);

  // 按段落预处理
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  let currentChunk = "";
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    // 如果段落本身超过 chunk 大小，按句子切分
    if (paragraph.length > chunkCharSize) {
      // 先 flush 当前的 chunk
      if (currentChunk.trim().length > 0) {
        chunks.push({ content: currentChunk.trim(), index: chunkIndex++, tokenCount: estimateTokens(currentChunk) });
        currentChunk = "";
      }
      // 按标点分句再组合
      const sentences = paragraph.split(/(?<=[。！？.!?\n])/).filter((s) => s.trim().length > 0);
      let sentenceBuffer = "";
      for (const sentence of sentences) {
        if ((sentenceBuffer + sentence).length > chunkCharSize && sentenceBuffer.length > 0) {
          chunks.push({ content: sentenceBuffer.trim(), index: chunkIndex++, tokenCount: estimateTokens(sentenceBuffer) });
          sentenceBuffer = sentence;
        } else {
          sentenceBuffer += sentence;
        }
      }
      if (sentenceBuffer.trim().length > 0) {
        chunks.push({ content: sentenceBuffer.trim(), index: chunkIndex++, tokenCount: estimateTokens(sentenceBuffer) });
      }
      continue;
    }

    // 正常段落合并到当前 chunk
    if ((currentChunk + "\n\n" + paragraph).length > chunkCharSize && currentChunk.length > 0) {
      chunks.push({ content: currentChunk.trim(), index: chunkIndex++, tokenCount: estimateTokens(currentChunk) });
      // overlap: 保留当前 chunk 末尾部分
      currentChunk = currentChunk.slice(-overlapCharSize) + "\n\n" + paragraph;
    } else {
      currentChunk = currentChunk.length > 0 ? currentChunk + "\n\n" + paragraph : paragraph;
    }
  }

  // 最后一个 chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({ content: currentChunk.trim(), index: chunkIndex++, tokenCount: estimateTokens(currentChunk) });
  }

  return chunks;
}

/** 根据最大 token 数重新分块（用于超过模型限制的段落） */
export function chunkByMaxTokens(text: string, maxTokens: number): string[] {
  const maxChars = Math.floor(maxTokens * AVG_CHARS_PER_TOKEN);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push(text.slice(i, i + maxChars));
  }
  return chunks;
}
