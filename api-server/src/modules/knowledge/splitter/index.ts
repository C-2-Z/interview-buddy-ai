/**
 * 知识库 Splitter 模块：注册所有内置的分块策略到全局注册表
 * 提供便捷的 splitText() 函数作为默认入口，兼容旧 chunking.service.ts 的调用方式
 */

import { splitterRegistry } from "./splitter-registry.js";
import { RecursiveCharSplitter } from "./strategies/recursive-char-splitter.js";
import { SentenceSplitter } from "./strategies/sentence-splitter.js";
import { SlidingWindowSplitter } from "./strategies/sliding-window-splitter.js";
import type { SplitterStrategy, TextChunk, SplitterConfig } from "./splitter-base.js";
import { DEFAULT_SPLITTER_CONFIG } from "./splitter-base.js";

/** 注册所有内置分块策略 */
export function registerBuiltinSplitters(): void {
  splitterRegistry.register("recursive", RecursiveCharSplitter);
  splitterRegistry.register("sentence", SentenceSplitter);
  splitterRegistry.register("sliding_window", SlidingWindowSplitter);
}

/** 默认分块策略名称 */
export const DEFAULT_STRATEGY: SplitterStrategy = "recursive";

/** 便捷函数：使用指定策略分块（兼容旧 chunkText 的调用签名）
 *  @param text - 待分块的纯文本
 *  @param strategy - 分块策略（默认 recursive）
 *  @param config - 可选分块配置覆盖
 *  @returns 分块数组 */
export function splitText(
  text: string,
  strategy: SplitterStrategy = DEFAULT_STRATEGY,
  config?: Partial<SplitterConfig>,
): TextChunk[] {
  const splitter = splitterRegistry.getInstance(strategy, config);
  return splitter.split(text);
}

/** 根据 token 上限重新分块（用于超过模型限制的段落）*/
export function splitByMaxTokens(
  text: string,
  maxTokens: number,
  charsPerToken: number = DEFAULT_SPLITTER_CONFIG.charsPerToken,
): string[] {
  const maxChars = Math.floor(maxTokens * charsPerToken);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push(text.slice(i, i + maxChars));
  }
  return chunks;
}

export { splitterRegistry, SplitterRegistry } from "./splitter-registry.js";
export { SplitterBase, type SplitterConfig, type TextChunk, type SplitterStrategy, DEFAULT_SPLITTER_CONFIG } from "./splitter-base.js";
