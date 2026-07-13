/**
 * 知识库 Splitter 模块：文本分块抽象基类与配置
 * 借鉴 Quivr 的 SplitterConfig 概念，支持分块策略可切换
 */

/** 分块配置 */
export interface SplitterConfig {
  /** 每个 chunk 的目标 token 数（近似）*/
  chunkSize: number;
  /** 相邻 chunk 之间的重叠 token 数 */
  chunkOverlap: number;
  /** 字符到 token 的估算倍率（中英文混合 ≈1.3, 纯英文 ≈0.25）*/
  charsPerToken: number;
}

/** 默认分块配置 */
export const DEFAULT_SPLITTER_CONFIG: SplitterConfig = {
  chunkSize: 800,
  chunkOverlap: 100,
  charsPerToken: 1.3,
};

/** 单个文本分块 */
export interface TextChunk {
  content: string;
  index: number;
  tokenCount: number;
}

/** 分块策略标识 */
export type SplitterStrategy = "recursive" | "sentence" | "sliding_window";

/** 分块器的抽象基类 */
export abstract class SplitterBase {
  abstract readonly name: SplitterStrategy;
  protected config: SplitterConfig;

  constructor(config: Partial<SplitterConfig> = {}) {
    this.config = { ...DEFAULT_SPLITTER_CONFIG, ...config };
  }

  /** 估算文本的 token 数 */
  protected estimateTokens(text: string): number {
    return Math.ceil(text.length / this.config.charsPerToken);
  }

  /** 将纯文本切分成多个 chunk */
  abstract split(text: string): TextChunk[];
}
