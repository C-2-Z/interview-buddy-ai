// @ts-nocheck - 新表类型定义在 supabase-types.ts 中尚未生成
/** 知识图谱：图边数据 — Supabase 数据库访问 */

import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import type { GraphEdge, GraphData, GraphNode, GraphLink, BacklinkDetail } from "./knowledge.types.js";

/** 批量插入图边（反链关系） */
function toSnake(obj) {
  const r = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    r[k.replace(/[A-Z]/g, c => '_' + c.toLowerCase())] = v;
  }
  return r;
}
export async function insertGraphEdges(
  supabase: UserSupabaseClient,
  edges: Array<{
    sourceChunkId: string;
    targetChunkId: string;
    similarity: number;
    userId: string;
  }>,
): Promise<void> {
  if (edges.length === 0) return;
  const rows = edges.map((e) => ({
    source_chunk_id: e.sourceChunkId,
    target_chunk_id: e.targetChunkId,
    similarity: e.similarity,
    user_id: e.userId,
  }));
  // 使用 upsert 以避免 UNIQUE 冲突
  const { error } = await supabase.from("knowledge_graph_edges").upsert(rows, {
    onConflict: "source_chunk_id, target_chunk_id",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`插入图边失败: ${error.message}`);
}

/** 删除指定文档相关的所有图边（文档删除时或重建时用） */
export async function deleteEdgesByDocument(
  supabase: UserSupabaseClient,
  documentId: string,
): Promise<void> {
  // 通过 chunks 关联删除
  const { error } = await supabase
    .from("knowledge_graph_edges")
    .delete()
    .or(`source_chunk_id.in.(${documentId}),target_chunk_id.in.(${documentId})`);
  // 简化实现：先获取该文档的所有 chunk ids，再删除
  const { data: chunks } = await supabase
    .from("knowledge_chunks")
    .select("id")
    .eq("document_id", documentId);
  const chunkIds = (chunks ?? []).map((c: Record<string, unknown>) => c.id as string);
  if (chunkIds.length === 0) return;
  const { error: delError } = await supabase
    .from("knowledge_graph_edges")
    .delete()
    .in("source_chunk_id", chunkIds);
  if (delError) throw new Error(`删除图边失败: ${delError.message}`);
}

/** 获取某个 chunk 的所有反链（哪些其他 chunk 指向它） */
export async function getBacklinks(
  supabase: UserSupabaseClient,
  chunkId: string,
  minSimilarity: number = 0.7,
): Promise<BacklinkDetail[]> {
  const { data: edges, error } = await supabase
    .from("knowledge_graph_edges")
    .select("source_chunk_id, similarity")
    .eq("target_chunk_id", chunkId)
    .gte("similarity", minSimilarity)
    .order("similarity", { ascending: false });
  if (error) throw new Error(`获取反链失败: ${error.message}`);

  if (!edges || edges.length === 0) return [];

  const sourceIds = edges.map((e: Record<string, unknown>) => e.source_chunk_id as string);

  const { data: chunks } = await supabase
    .from("knowledge_chunks")
    .select("id, content, document_id")
    .in("id", sourceIds);

  const chunkMap = new Map<string, Record<string, unknown>>();
  for (const c of (chunks ?? []) as Array<Record<string, unknown>>) {
    chunkMap.set(c.id as string, c);
  }

  // 获取文档标题
  const docIds = [...new Set((chunks ?? []).map((c: Record<string, unknown>) => c.document_id as string))];
  const { data: docs } = await supabase
    .from("knowledge_documents")
    .select("id, title")
    .in("id", docIds);
  const docTitleMap = new Map<string, string>();
  for (const d of (docs ?? []) as Array<Record<string, unknown>>) {
    docTitleMap.set(d.id as string, d.title as string);
  }

  return edges.map((e: Record<string, unknown>) => {
    const chunk = chunkMap.get(e.source_chunk_id as string);
    const content = (chunk?.content as string) ?? "";
    const docId = (chunk?.document_id as string) ?? "";
    return {
      chunkId: e.source_chunk_id as string,
      content: content.length > 200 ? content.slice(0, 200) + "..." : content,
      similarity: e.similarity as number,
      documentTitle: docTitleMap.get(docId) ?? "未知文档",
    };
  });
}

/** 组装图谱数据（nodes + links），供前端渲染 */
export async function assembleGraphData(
  supabase: UserSupabaseClient,
  userId: string,
  options: { minSimilarity?: number; documentIds?: string[] },
): Promise<GraphData> {
  const { minSimilarity = 0.7, documentIds } = options;

  // 获取文档
  let docQuery = supabase
    .from("knowledge_documents")
    .select("id, title, file_type")
    .eq("user_id", userId)
    .eq("status", "ready");
  if (documentIds && documentIds.length > 0) {
    docQuery = docQuery.in("id", documentIds);
  }
  const { data: docs, error: docError } = await docQuery;
  if (docError) throw new Error(`获取文档列表失败: ${docError.message}`);
  const docList = (docs ?? []) as Array<Record<string, unknown>>;

  if (docList.length === 0) return { nodes: [], links: [] };

  const docIdSet = new Set(docList.map((d) => d.id as string));

  // 获取 chunks
  const { data: chunks, error: chunkError } = await supabase
    .from("knowledge_chunks")
    .select("id, document_id, content")
    .eq("user_id", userId)
    .in("document_id", [...docIdSet]);
  if (chunkError) throw new Error(`获取 chunks 失败: ${chunkError.message}`);
  const chunkList = (chunks ?? []) as Array<Record<string, unknown>>;

  // 文档色板（按索引分配颜色）
  const colors = [
    "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
    "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6",
  ];

  const nodes: GraphNode[] = [];
  const chunkDocMap = new Map<string, string>();

  for (let i = 0; i < docList.length; i++) {
    const doc = docList[i];
    const color = colors[i % colors.length];
    nodes.push({
      id: doc.id as string,
      label: (doc.title as string).length > 20
        ? (doc.title as string).slice(0, 20) + "..."
        : (doc.title as string),
      type: "document",
      color,
      size: 20,
    });
  }

  for (const chunk of chunkList) {
    const docId = chunk.document_id as string;
    chunkDocMap.set(chunk.id as string, docId);
    const doc = docList.find((d) => d.id === docId);
    const color = doc ? colors[docList.indexOf(doc) % colors.length] : "#94a3b8";
    nodes.push({
      id: chunk.id as string,
      label: (chunk.content as string).length > 30
        ? (chunk.content as string).slice(0, 30) + "..."
        : (chunk.content as string),
      type: "chunk",
      color,
      documentId: docId,
      size: 6,
      content: (chunk.content as string).length > 200
        ? (chunk.content as string).slice(0, 200) + "..."
        : (chunk.content as string),
    });
  }

  // 获取图边
  const chunkIds = chunkList.map((c) => c.id as string);
  if (chunkIds.length === 0) return { nodes, links: [] };

  const { data: edges, error: edgeError } = await supabase
    .from("knowledge_graph_edges")
    .select("source_chunk_id, target_chunk_id, similarity")
    .in("source_chunk_id", chunkIds)
    .gte("similarity", minSimilarity);
  if (edgeError) throw new Error(`获取图边失败: ${edgeError.message}`);

  const links: GraphLink[] = ((edges ?? []) as Array<Record<string, unknown>>)
    .filter((e) => chunkDocMap.has(e.target_chunk_id as string)) // 只保留两端都在图中的边
    .map((e) => ({
      source: e.source_chunk_id as string,
      target: e.target_chunk_id as string,
      value: e.similarity as number,
    }));

  return { nodes, links };
}

/** 删除用户的所有图边（全量重建时用） */
export async function deleteAllEdgesByUser(
  supabase: UserSupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("knowledge_graph_edges")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(`删除用户图边失败: ${error.message}`);
}
