// @ts-nocheck - 新表类型定义在 supabase-types.ts 中尚未生成
/** 知识库模块：文档、chunk、QA 会话 — Supabase 数据库访问 */

import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import type { KnowledgeDocument, KnowledgeChunk, QaSession, QaMessage } from "./knowledge.types.js";

// ============================================================
// Document CRUD
// ============================================================

/** 创建文档记录，返回新记录的 id */
export async function createDocument(
  supabase: UserSupabaseClient,
  userId: string,
  doc: {
    title: string;
    fileName: string | null;
    fileType: string;
    fileSize: number | null;
    fileHash: string | null;
    source: string;
    status: string;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("knowledge_documents")
    .insert({
      user_id: userId,
      title: doc.title,
      file_name: doc.fileName,
      file_type: doc.fileType,
      file_size: doc.fileSize,
      file_hash: doc.fileHash,
      source: doc.source,
      status: doc.status,
    })
    .select("id")
    .single();
  if (error) throw new Error(`创建文档失败: ${error.message}`);
  return data.id;
}

/** 创建文档记录，返回新记录的 id */
/** 更新文档状态 */
export async function updateDocumentStatus(
  supabase: UserSupabaseClient,
  docId: string,
  status: string,
  extra?: { chunkCount?: number; errorMessage?: string },
): Promise<void> {
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (extra?.chunkCount !== undefined) update.chunk_count = extra.chunkCount;
  if (extra?.errorMessage !== undefined) update.error_message = extra.errorMessage;
  const { error } = await supabase.from("knowledge_documents").update(update).eq("id", docId);
  if (error) throw new Error(`更新文档状态失败: ${error.message}`);
}

/** 获取用户的文档列表 */
export async function listDocuments(
  supabase: UserSupabaseClient,
  userId: string,
): Promise<KnowledgeDocument[]> {
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`获取文档列表失败: ${error.message}`);
  return (data ?? []).map(mapDocumentRow);
}

/** 获取单个文档 */
export async function getDocument(
  supabase: UserSupabaseClient,
  docId: string,
): Promise<KnowledgeDocument | null> {
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("id", docId)
    .single();
  if (error) return null;
  return mapDocumentRow(data);
}

/** 删除文档（CASCADE 会自动删除 chunks、graph edges） */
export async function deleteDocument(supabase: UserSupabaseClient, docId: string): Promise<void> {
  const { error } = await supabase.from("knowledge_documents").delete().eq("id", docId);
  if (error) throw new Error(`删除文档失败: ${error.message}`);
}

// ============================================================
// Chunk CRUD
// ============================================================

/** 批量插入 chunks */
export async function insertChunks(
  supabase: UserSupabaseClient,
  chunks: Array<{
    documentId: string;
    userId: string;
    chunkIndex: number;
    content: string;
    tokenCount?: number;
    embedding: number[];
  }>,
): Promise<void> {
  const rows = chunks.map((c) => ({
    document_id: c.documentId,
    user_id: c.userId,
    chunk_index: c.chunkIndex,
    content: c.content,
    token_count: c.tokenCount ?? null,
    embedding: c.embedding,
  }));
  const { error } = await supabase.from("knowledge_chunks").insert(rows);
  if (error) throw new Error(`插入 chunks 失败: ${error.message}`);
}

/** 获取文档的所有 chunks */
export async function getChunksByDocument(
  supabase: UserSupabaseClient,
  documentId: string,
): Promise<KnowledgeChunk[]> {
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("id, document_id, user_id, chunk_index, content, token_count, created_at")
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true });
  if (error) throw new Error(`获取 chunks 失败: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    documentId: r.document_id as string,
    userId: r.user_id as string,
    chunkIndex: r.chunk_index as number,
    content: r.content as string,
    tokenCount: r.token_count as number | null,
    createdAt: r.created_at as string,
  }));
}

/** 获取单个 chunk 内容和 embedding */
export async function getChunkWithEmbedding(
  supabase: UserSupabaseClient,
  chunkId: string,
): Promise<{ id: string; documentId: string; content: string; embedding: number[] } | null> {
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("id, document_id, content, embedding")
    .eq("id", chunkId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    documentId: data.document_id as string,
    content: data.content,
    embedding: data.embedding as unknown as number[],
  };
}

/** 获取用户所有 chunks 的 id + embedding（用于图反链计算） */
export async function getAllChunkEmbeddings(
  supabase: UserSupabaseClient,
  userId: string,
  documentIds?: string[],
): Promise<Array<{ id: string; documentId: string; embedding: number[] }>> {
  let query = supabase
    .from("knowledge_chunks")
    .select("id, document_id, embedding")
    .eq("user_id", userId);
  if (documentIds && documentIds.length > 0) {
    query = query.in("document_id", documentIds);
  }
  const { data, error } = await query;
  if (error) throw new Error(`获取 chunk embedding 失败: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    documentId: r.document_id as string,
    embedding: r.embedding as unknown as number[],
  }));
}

// ============================================================
// Vector Search
// ============================================================

/** 向量相似度搜索（cosine），返回匹配的 chunks */
export async function vectorSearch(
  supabase: UserSupabaseClient,
  userId: string,
  embedding: number[],
  options: { topK?: number; documentIds?: string[] },
): Promise<
  Array<{
    chunkId: string;
    documentId: string;
    content: string;
    similarity: number;
    documentTitle: string;
  }>
> {
  const { topK = 5, documentIds } = options;

  // 如果 RPC 不存在，用原始 SQL 方式；这里用 select with order
  // 获取所有 chunks 的 embedding，在 JS 侧计算余弦相似度并排序
  let manualQuery = supabase
    .from("knowledge_chunks")
    .select(
      `
      id, document_id, content, embedding,
      document_title: knowledge_documents!inner(title)
    `,
    )
    .eq("user_id", userId);

  if (documentIds && documentIds.length > 0) {
    manualQuery = manualQuery.in("document_id", documentIds);
  }

  // 由于 supabase-js 不支持直接的向量排序，我们获取所有 chunks 后 JS 侧排序
  // 在实际生产环境中应使用 pgvector 的 SQL 查询 ORDER BY embedding <=> $1
  const { data, error } = await manualQuery;
  if (error) throw new Error(`向量搜索失败: ${error.message}`);

  // JS 侧计算 cosine similarity 并排序取 topK
  const scored = ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const emb = r.embedding as unknown as number[] | null;
    let sim = 0;
    if (emb) {
      sim = cosineSimilarity(embedding, emb);
    }
    return {
      chunkId: r.id as string,
      documentId: r.document_id as string,
      content: r.content as string,
      similarity: sim,
      documentTitle: (r.document_title ?? "") as string,
    };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

/** 余弦相似度计算 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ============================================================
// QA Sessions
// ============================================================

/** 创建 QA 会话 */
export async function createQaSession(
  supabase: UserSupabaseClient,
  userId: string,
  data: { title?: string; documentIds?: string[] },
): Promise<QaSession> {
  const { data: result, error } = await supabase
    .from("qa_sessions")
    .insert({
      user_id: userId,
      title: data.title ?? "新问答",
      document_ids: data.documentIds ?? [],
    })
    .select("*")
    .single();
  if (error) throw new Error(`创建问答会话失败: ${error.message}`);
  return mapQaSessionRow(result);
}

/** 获取用户的 QA 会话列表 */
export async function listQaSessions(
  supabase: UserSupabaseClient,
  userId: string,
): Promise<QaSession[]> {
  const { data, error } = await supabase
    .from("qa_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`获取问答会话列表失败: ${error.message}`);
  return (data ?? []).map(mapQaSessionRow);
}

/** 获取单个 QA 会话 */
export async function getQaSession(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<QaSession | null> {
  const { data, error } = await supabase
    .from("qa_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (error) return null;
  return mapQaSessionRow(data);
}

/** 更新 QA 会话 */
export async function updateQaSession(
  supabase: UserSupabaseClient,
  sessionId: string,
  data: { title?: string; documentIds?: string[] },
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.title !== undefined) update.title = data.title;
  if (data.documentIds !== undefined) update.document_ids = data.documentIds;
  const { error } = await supabase.from("qa_sessions").update(update).eq("id", sessionId);
  if (error) throw new Error(`更新问答会话失败: ${error.message}`);
}

/** 删除 QA 会话（CASCADE 删除消息） */
export async function deleteQaSession(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.from("qa_sessions").delete().eq("id", sessionId);
  if (error) throw new Error(`删除问答会话失败: ${error.message}`);
}

// ============================================================
// QA Messages
// ============================================================

/** 插入 QA 消息 */
export async function insertQaMessage(
  supabase: UserSupabaseClient,
  msg: {
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    citedChunks?: Array<Record<string, unknown>>;
    tokenUsage?: Record<string, unknown>;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("qa_messages")
    .insert({
      session_id: msg.sessionId,
      role: msg.role,
      content: msg.content,
      cited_chunks: msg.citedChunks ?? [],
      token_usage: msg.tokenUsage ?? {},
    })
    .select("id")
    .single();
  if (error) throw new Error(`插入消息失败: ${error.message}`);
  return data.id;
}

/** 获取 QA 会话的消息列表 */
export async function listQaMessages(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<QaMessage[]> {
  const { data, error } = await supabase
    .from("qa_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`获取消息列表失败: ${error.message}`);
  return (data ?? []).map(mapQaMessageRow);
}

/** 更新会话的消息计数 */
export async function incrementQaMessageCount(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.rpc("increment_qa_message_count", {
    session_id: sessionId,
  });
  if (error) {
    // fallback: 手动计数
    const { data: msgs } = await supabase
      .from("qa_messages")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    const count = msgs?.length ?? 0;
    await supabase
      .from("qa_sessions")
      .update({ message_count: count, updated_at: new Date().toISOString() })
      .eq("id", sessionId);
  }
}

// ============================================================
// Mappers
// ============================================================

function mapDocumentRow(row: Record<string, unknown>): KnowledgeDocument {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    fileName: (row.file_name as string) ?? null,
    fileType: row.file_type as "pdf" | "docx" | "txt" | "md",
    fileSize: (row.file_size as number) ?? null,
    fileHash: (row.file_hash as string) ?? null,
    source: (row.source as string) ?? "upload",
    docMetadata: (row.doc_metadata ?? {}) as Record<string, unknown>,
    chunkCount: (row.chunk_count as number) ?? 0,
    status: row.status as "processing" | "ready" | "failed",
    errorMessage: (row.error_message as string) ?? null,
    createdAt: row.created_at as string,
  };
}

function mapQaSessionRow(row: Record<string, unknown>): QaSession {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    documentIds: (row.document_ids as string[]) ?? [],
    messageCount: (row.message_count as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapQaMessageRow(row: Record<string, unknown>): QaMessage {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    role: row.role as "user" | "assistant",
    content: row.content as string,
    citedChunks:
      (row.cited_chunks as Array<Record<string, unknown>>)?.map((c) => ({
        chunkId: c.chunkId as string,
        documentId: c.documentId as string,
        content: c.content as string,
        similarity: c.similarity as number,
      })) ?? [],
    tokenUsage: (row.token_usage as Record<string, number | undefined>) ?? {},
    createdAt: row.created_at as string,
  };
}
