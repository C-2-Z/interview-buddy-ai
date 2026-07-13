/**
 * 知识库 Splitter 策略：滑动窗口分块 — 固定步长滑动窗口，适合代码和技术文档
 * 按 token 数而非字符作为窗口单位，确保每个 chunk 的 token 数均匀
 */

import { SplitterBase, type TextChunk, type SplitterConfig } from "../splitter-base.js";

/** 滑动窗口分块器：固定大小的滑动窗口，确保每个 chunk 大小均匀 */
export class SlidingWindowSplitter extends SplitterBase {
  readonly name = "sliding_window" as const;

  constructor(config?: Partial<SplitterConfig>) {
    super(config);
  }

  split(text: string): TextChunk[] {
    if (!text || text.trim().length === 0) return [];

    const chunks: TextChunk[] = [];
    const chunkCharSize = Math.floor(this.config.chunkSize * this.config.charsPerToken);
    const stepSize =
      chunkCharSize - Math.floor(this.config.chunkOverlap * this.config.charsPerToken);
    const safeStep = Math.max(stepSize, 1);

    let index = 0;
    let pos = 0;

    while (pos < text.length) {
      const end = Math.min(pos + chunkCharSize, text.length);
      const content = text.slice(pos, end);

      chunks.push({
        content,
        index: index++,
        tokenCount: this.estimateTokens(content),
      });

      pos += safeStep;

      // 如果剩余文本不足半个 chunk，直接作为最后一个 chunk
      if (text.length - pos < chunkCharSize / 2 && text.length - pos > 0) {
        const tailContent = text.slice(pos);
        chunks.push({
          content: tailContent,
          index: index++,
          tokenCount: this.estimateTokens(tailContent),
        });
        break;
      }
    }

    return chunks;
  }
}
