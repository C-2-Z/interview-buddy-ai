/**
 * 知识库 RAG 模块：Prompt 模板 — 可配置的 System Prompt 与模板渲染
 * 借鉴 Quivr 的 CustomPromptsDict 设计，支持自定义 prompt 模板 + 变量注入
 *
 * 可用变量:
 *   {context}    — 检索到的知识库上下文文本
 *   {question}   — 用户的当前问题
 *   {history}    — 历史对话摘要（最近 2-3 轮）
 *   {files}      — 关联的文件列表
 *   {date}       — 当前日期
 */

import { createModuleLogger } from "../../voice/voice-logger.js";

const logger = createModuleLogger("rag-prompts");

/** Prompt 模板变量 */
export interface PromptVariables {
  context?: string;
  question?: string;
  history?: string;
  files?: string;
  date?: string;
  [key: string]: string | undefined;
}

/** 默认知识库 QA System Prompt 模板
 *  带中文注释，方便用户理解各变量的含义后自定义 */
export const DEFAULT_QA_SYSTEM_PROMPT = `你是一个知识库问答助手。请基于以下参考资料回答用户的问题。

{context}

{context_part}

{history_part}

请用中文回答，保持简洁准确。如果引用了某份资料，请在回答末尾以 [1][2] 格式标注引用编号。`;

/** 无上下文时的 fallback prompt */
export const NO_CONTEXT_SYSTEM_PROMPT = `你是一个知识库问答助手。未找到完全匹配的参考资料。请尽力回答，同时说明当前回答是基于通用知识还是已有资料。

请用中文回答，保持简洁准确。`;

/** 会话标题生成 prompt */
export const SESSION_TITLE_PROMPT = `用 10 个字以内总结以下问答的核心主题，只返回标题文本不要多余内容。`;

/** 默认 RAG 上下文前缀 */
export const DEFAULT_CONTEXT_HEADER = "以下是与用户问题相关的参考资料（来自知识库）：\n\n";

/** 渲染 prompt 模板：将模板中的 {变量名} 替换为实际值
 *  未提供的变量会被替换为空字符串 */
export function renderTemplate(template: string, variables: PromptVariables): string {
  let result = template;

  // 特殊处理 context_part 和 history_part：如果对应的变量为空，则整个 section 不显示
  if (!variables.context || variables.context.trim().length === 0) {
    result = result.replace(/\{context_part\}/g, "未找到完全匹配的参考资料，以下为最相关的内容供参考。");
  } else {
    result = result.replace(/\{context_part\}/g, "请基于上述参考资料回答。如果参考资料不足以回答问题，请说明。");
  }

  if (!variables.history || variables.history.trim().length === 0) {
    result = result.replace(/\{history_part\}/g, "");
  } else {
    result = result.replace(/\{history_part\}/g, `\n历史对话：\n${variables.history}\n`);
  }

  // 通用变量替换
  for (const [key, value] of Object.entries(variables)) {
    if (key === "context_part" || key === "history_part") continue; // 已处理
    if (value !== undefined) {
      result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
    } else {
      result = result.replace(new RegExp(`\\{${key}\\}`, "g"), "");
    }
  }

  return result;
}

/** 构建 QA System Prompt（兼容旧 buildQaSystemPrompt 的调用签名）
 *  @param context - 检索到的知识库上下文
 *  @param customPrompt - 用户自定义 prompt 模板（可选，使用默认模板则传 null）
 *  @param history - 历史对话摘要（可选）
 *  @returns 渲染后的完整 prompt 字符串 */
export function buildQaSystemPrompt(
  context: string,
  customPrompt?: string | null,
  history?: string,
): string {
  const template = customPrompt ?? DEFAULT_QA_SYSTEM_PROMPT;
  const variables: PromptVariables = {
    context,
    history,
    date: new Date().toISOString().slice(0, 10),
  };

  logger.debug(`渲染 QA System Prompt: ${template.slice(0, 60)}...`);
  return renderTemplate(template, variables);
}

/** 构建会话标题 prompt */
export function buildSessionTitlePrompt(): string {
  return SESSION_TITLE_PROMPT;
}

/** 构建无上下文 prompt */
export function buildNoContextPrompt(): string {
  return NO_CONTEXT_SYSTEM_PROMPT;
}

/** 构建搜索上下文文本（将搜索结果拼接为可注入的上下文）
 *  @param results - 搜索结果
 *  @param maxChars - 最大字符数 */
export function buildContextFromResults(
  results: Array<{ documentTitle: string; content: string }>,
  maxChars: number = 4000,
): string {
  if (results.length === 0) return "";
  let context = DEFAULT_CONTEXT_HEADER;
  let totalChars = context.length;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const entry = `[${i + 1}] 来自《${r.documentTitle}》\n${r.content}\n\n`;
    if (totalChars + entry.length > maxChars) break;
    context += entry;
    totalChars += entry.length;
  }
  return context;
}
