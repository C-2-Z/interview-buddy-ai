/** 知识库：QA 问答服务 — 基于选定文档提问，AI 检索 chunks 后作答 */

import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { callAI, streamAI, type ChatMessage } from "../../shared/ai/ai-client.js";
import { searchKnowledge } from "./search.service.js";
import { rewriteQuery } from "./rag/query-rewriter.js";
import { compressResults, buildCompressedCitedChunks } from "./rag/context-compressor.js";
import { buildQaSystemPrompt, buildSessionTitlePrompt } from "./rag/prompts.js";
import {
  createQaSession as repoCreateSession,
  getQaSession as repoGetSession,
  updateQaSession as repoUpdateSession,
  listQaMessages,
  insertQaMessage,
  incrementQaMessageCount,
} from "./knowledge.repository.js";
import type { QaSession, QaMessage } from "./knowledge.types.js";

/** 创建 QA 会话 */
export async function createQaSession(
  supabase: UserSupabaseClient,
  userId: string,
  data: { title?: string; documentIds?: string[] },
): Promise<QaSession> {
  return repoCreateSession(supabase, userId, data);
}

/** 获取用户的 QA 会话列表 */
export async function getQaSessionList(
  supabase: UserSupabaseClient,
  userId: string,
): Promise<QaSession[]> {
  return (await import("./knowledge.repository.js")).listQaSessions(supabase, userId);
}

/** 获取单个 QA 会话 */
export async function getQaSessionById(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<QaSession | null> {
  return repoGetSession(supabase, sessionId);
}

/** 更新 QA 会话 */
export async function updateQaSession(
  supabase: UserSupabaseClient,
  sessionId: string,
  data: { title?: string; documentIds?: string[] },
): Promise<void> {
  return repoUpdateSession(supabase, sessionId, data);
}

/** 删除 QA 会话 */
export async function deleteQaSession(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<void> {
  return (await import("./knowledge.repository.js")).deleteQaSession(supabase, sessionId);
}

/** 获取 QA 会话的消息列表 */
export async function getQaMessages(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<QaMessage[]> {
  return listQaMessages(supabase, sessionId);
}

/** 根据首条问答内容自动生成会话标题 */
async function generateSessionTitle(question: string, answer: string): Promise<string> {
  try {
    const title = await callAI([
      {
        role: "system",
        content: buildSessionTitlePrompt(),
      },
      {
        role: "user",
        content: `问：${question}\n答：${answer.slice(0, 200)}`,
      },
    ]);
    return title.trim().slice(0, 50) || "知识库问答";
  } catch {
    // fallback
    return question.slice(0, 30) || "知识库问答";
  }
}

/** 流式提问（返回 AsyncIterable），用于前端 SSE 消费 */
export async function* askQuestionStream(
  supabase: UserSupabaseClient,
  userId: string,
  sessionId: string,
  question: string,
): AsyncIterable<string> {
  // 先同步保存用户消息
  const session = await repoGetSession(supabase, sessionId);
  if (!session) throw new Error("问答会话不存在");

  const history = await listQaMessages(supabase, sessionId);

  // Query Rewrite
  const searchQuery = history.length >= 2 ? await rewriteQuery(question, history) : question;

  // 检索知识（召回更多候选，供压缩裁剪）
  const results = await searchKnowledge(supabase, userId, searchQuery, {
    documentIds: session.documentIds.length > 0 ? session.documentIds : undefined,
    topK: 10,
  });

  // Context Compression
  const { context: contextText, compressedResults } = compressResults(results, { maxChars: 4000 });
  const citedChunks = buildCompressedCitedChunks(compressedResults);

  // 构建 prompt
  const messages: ChatMessage[] = [{ role: "system", content: buildQaSystemPrompt(contextText) }];
  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: "user", content: question });

  // 保存用户消息
  await insertQaMessage(supabase, { sessionId, role: "user", content: question });

  // 流式调用 AI
  let fullAnswer = "";
  for await (const delta of callAIStream(messages)) {
    fullAnswer += delta;
    yield JSON.stringify({ type: "delta", content: delta });
  }

  // 保存助手消息
  const totalText = [...messages.map((m) => m.content), fullAnswer].join("");
  await insertQaMessage(supabase, {
    sessionId,
    role: "assistant",
    content: fullAnswer,
    citedChunks: citedChunks as unknown as Array<Record<string, unknown>>,
    tokenUsage: { total: Math.ceil(totalText.length / 4) } as unknown as Record<string, unknown>,
  });

  await incrementQaMessageCount(supabase, sessionId);

  // 首条自动生成标题
  if (history.length === 0) {
    const title = await generateSessionTitle(question, fullAnswer);
    await repoUpdateSession(supabase, sessionId, { title });
  }

  // 返回完整元数据
  yield JSON.stringify({
    type: "meta",
    citedChunks,
    fullAnswer,
  });
}

/** 流式 AI 调用（使用 streamAI 原生流式接口，逐 token 返回） */
async function* callAIStream(messages: ChatMessage[]): AsyncIterable<string> {
  for await (const delta of streamAI(messages)) {
    yield delta;
  }
}
