/**
 * 知识库 Splitter 策略：递归字符分块 — 按段落 → 句子 → 字符递归切分，支持 overlap
 * 相当于当前 chunking.service.ts 的逻辑，但配置化且精确估算 token
 */

import { SplitterBase, type TextChunk, type SplitterConfig } from "../splitter-base.js";

/** 递归字符分块器：基于当前 chunking.service.ts 逻辑重构，支持自定义分块配置 */
export class RecursiveCharSplitter extends SplitterBase {
  readonly name = "recursive" as const;

  constructor(config?: Partial<SplitterConfig>) {
    super(config);
  }

  split(text: string): TextChunk[] {
    if (!text || text.trim().length === 0) return [];

    const chunks: TextChunk[] = [];
    const chunkCharSize = Math.floor(this.config.chunkSize * this.config.charsPerToken);
    const overlapCharSize = Math.floor(this.config.chunkOverlap * this.config.charsPerToken);

    // 按段落预处理
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

    let currentChunk = "";
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      // 段落超过 chunk 大小，按句子切分
      if (paragraph.length > chunkCharSize) {
        if (currentChunk.trim().length > 0) {
          chunks.push({ content: currentChunk.trim(), index: chunkIndex++, tokenCount: this.estimateTokens(currentChunk) });
          currentChunk = "";
        }
        // 按标点分句再组合
        const sentences = paragraph.split(/(?<=[。！？.!?\n])/).filter((s) => s.trim().length > 0);
        let sentenceBuffer = "";
        for (const sentence of sentences) {
          if ((sentenceBuffer + sentence).length > chunkCharSize && sentenceBuffer.length > 0) {
            chunks.push({ content: sentenceBuffer.trim(), index: chunkIndex++, tokenCount: this.estimateTokens(sentenceBuffer) });
            sentenceBuffer = sentence;
          } else {
            sentenceBuffer += sentence;
          }
        }
        if (sentenceBuffer.trim().length > 0) {
          chunks.push({ content: sentenceBuffer.trim(), index: chunkIndex++, tokenCount: this.estimateTokens(sentenceBuffer) });
        }
        continue;
      }

      // 正常段落合并到当前 chunk
      const nextLen = currentChunk.length > 0 ? currentChunk.length + 2 + paragraph.length : paragraph.length;
      if (nextLen > chunkCharSize && currentChunk.length > 0) {
        chunks.push({ content: currentChunk.trim(), index: chunkIndex++, tokenCount: this.estimateTokens(currentChunk) });
        currentChunk = currentChunk.slice(-overlapCharSize) + "\n\n" + paragraph;
      } else {
        currentChunk = currentChunk.length > 0 ? currentChunk + "\n\n" + paragraph : paragraph;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push({ content: currentChunk.trim(), index: chunkIndex++, tokenCount: this.estimateTokens(currentChunk) });
    }

    return chunks;
  }
}
