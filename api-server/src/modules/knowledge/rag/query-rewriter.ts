/**
 * 知识库 RAG 模块：Query Rewrite — 根据对话历史改写用户问题，消除歧义
 * 借鉴 Quivr 的 CONDENSE_TASK_PROMPT 设计
 *
 * 输入："它支持哪些格式？" （对话历史提到 PDF/Word）
 * 输出："知识库上传支持哪些文件格式？"
 */

import { createModuleLogger } from "../../../shared/logger/voice-logger.js";
import { callAI } from "../../../shared/ai/ai-client.js";
import type { QaMessage } from "../knowledge.types.js";

const logger = createModuleLogger("rag-query-rewriter");

/** Query Rewrite 配置 */
interface RewriteConfig {
  /** 最大历史轮数用于上下文 */
  maxHistoryPairs: number;
  /** 单条历史消息最大字符数 */
  maxHistoryChars: number;
}

const DEFAULT_CONFIG: RewriteConfig = {
  maxHistoryPairs: 3,
  maxHistoryChars: 500,
};

/** Query Rewrite prompt */
const REWRITE_PROMPT = `你是一个查询改写助手。用户的当前问题可能是对之前对话的延续。
请根据历史对话上下文，将当前问题改写为不依赖历史就能理解的独立问题。
不要回答问题本身，只输出改写后的查询文本。如果当前问题已足够独立，直接返回原问题。

历史对话：
{history}

当前问题：{question}
改写后：`;

/** 构建历史摘要文本 */
function buildHistorySummary(history: QaMessage[], config: RewriteConfig = DEFAULT_CONFIG): string {
  // 取最近 N 轮 human-assistant 对话对
  const pairs: string[] = [];
  let pairCount = 0;

  for (let i = history.length - 1; i >= 0 && pairCount < config.maxHistoryPairs; i -= 2) {
    const assistant = i >= 0 ? history[i] : null;
    const human = i - 1 >= 0 ? history[i - 1] : null;

    if (assistant?.role === "assistant" && human?.role === "user") {
      const q = human.content.slice(0, config.maxHistoryChars);
      const a = assistant.content.slice(0, config.maxHistoryChars);
      pairs.unshift(`问：${q}\n答：${a}`);
      pairCount++;
    }
  }

  return pairs.join("\n\n") || "(无历史对话)";
}

/** 改写查询：根据对话历史消歧
 *  @param question - 用户当前问题
 *  @param history - 会话历史消息列表
 *  @returns 改写后的独立查询 */
export async function rewriteQuery(question: string, history: QaMessage[]): Promise<string> {
  // 没有历史或历史很少，直接返回原始问题
  if (!history || history.length < 2) {
    return question;
  }

  const historySummary = buildHistorySummary(history);

  const prompt = REWRITE_PROMPT.replace("{history}", historySummary).replace(
    "{question}",
    question,
  );

  try {
    const rewritten = await callAI([
      { role: "system", content: "你是一个查询改写助手。严格按指令操作。" },
      { role: "user", content: prompt },
    ]);

    const result = rewritten.trim();
    // 如果改写结果为空或和原问题一样，返回原问题
    if (!result || result.length === 0 || result === question) {
      return question;
    }

    logger.info("查询改写完成", {
      inputLength: question.length,
      outputLength: result.length,
    });
    return result;
  } catch {
    logger.warn("查询改写失败，使用原始问题");
    return question;
  }
}

/** 构建历史的文本摘要（不 rewrite，仅拼接用于 prompt 中的 {history} 变量）*/
export function buildHistoryContext(history: QaMessage[], maxPairs: number = 3): string {
  return buildHistorySummary(history, { maxHistoryPairs: maxPairs, maxHistoryChars: 500 });
}
