/**
 * 知识库 Splitter 策略：按句分块 — 以句号、问号、感叹号、换行等为边界切分，适合中文长文档
 * 合并相邻短句以满足 chunkSize 要求，避免在句中切分
 */

import { SplitterBase, type TextChunk, type SplitterConfig } from "../splitter-base.js";

/** 按句分块器：以句子为最小粒度，适合中文、日文等基于句号分割的文本 */
export class SentenceSplitter extends SplitterBase {
  readonly name = "sentence" as const;

  constructor(config?: Partial<SplitterConfig>) {
    super(config);
  }

  split(text: string): TextChunk[] {
    if (!text || text.trim().length === 0) return [];

    const chunkCharSize = Math.floor(this.config.chunkSize * this.config.charsPerToken);
    const chunks: TextChunk[] = [];
    let chunkIndex = 0;

    // 按段落 → 句子切分
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

    for (const paragraph of paragraphs) {
      const sentences = paragraph
        .split(/(?<=[。！？.!?\n])/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      let buffer = "";
      for (const sentence of sentences) {
        // 单个句子就超过 chunk 大小，只能独立成块
        if (sentence.length > chunkCharSize) {
          if (buffer.trim().length > 0) {
            chunks.push({
              content: buffer.trim(),
              index: chunkIndex++,
              tokenCount: this.estimateTokens(buffer),
            });
            buffer = "";
          }
          chunks.push({
            content: sentence,
            index: chunkIndex++,
            tokenCount: this.estimateTokens(sentence),
          });
          continue;
        }

        const candidate = buffer.length > 0 ? buffer + sentence : sentence;
        if (candidate.length > chunkCharSize) {
          if (buffer.trim().length > 0) {
            chunks.push({
              content: buffer.trim(),
              index: chunkIndex++,
              tokenCount: this.estimateTokens(buffer),
            });
          }
          buffer = sentence;
        } else {
          buffer = candidate;
        }
      }

      if (buffer.trim().length > 0) {
        chunks.push({
          content: buffer.trim(),
          index: chunkIndex++,
          tokenCount: this.estimateTokens(buffer),
        });
      }
    }

    return chunks;
  }
}
