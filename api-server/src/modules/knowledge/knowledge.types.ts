/** 知识库模块：文档、chunk、QA、图谱 — 类型定义 */

import type { Json } from "../../lib/supabase-types.js";

/** 文档状态 */
export type DocStatus = "processing" | "ready" | "failed";

/** 文档文件类型 */
export type DocFileType = "pdf" | "docx" | "txt" | "md";

/** 文档上传时的输入 */
export interface DocumentUploadInput {
  title: string;
  content: string;        // 解析后的纯文本
  fileName?: string;
  fileType: DocFileType;
  fileSize?: number;
  fileHash?: string;
}

/** 知识库文档元数据 */
export interface KnowledgeDocument {
  id: string;
  userId: string;
  title: string;
  fileName: string | null;
  fileType: DocFileType;
  fileSize: number | null;
  fileHash: string | null;
  source: string;
  docMetadata: Json;
  chunkCount: number;
  status: DocStatus;
  errorMessage: string | null;
  createdAt: string;
}

/** 文档分块 */
export interface KnowledgeChunk {
  id: string;
  documentId: string;
  userId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  createdAt: string;
}

/** 图谱边（反链关系） */
export interface GraphEdge {
  id: string;
  sourceChunkId: string;
  targetChunkId: string;
  similarity: number;
  userId: string;
  createdAt: string;
}

/** 图谱节点（前端渲染用） */
export interface GraphNode {
  id: string;
  label: string;
  type: "document" | "chunk";
  color: string;
  documentId?: string;
  size: number;
  content?: string;       // chunk 文本预览
}

/** 图谱连线（前端渲染用） */
export interface GraphLink {
  source: string;
  target: string;
  value: number;          // 相似度
}

/** 图谱数据（前端渲染用） */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** 反链详情 */
export interface BacklinkDetail {
  chunkId: string;
  content: string;        // chunk 文本摘要
  similarity: number;
  documentTitle: string;
}

/** QA 会话 */
export interface QaSession {
  id: string;
  userId: string;
  title: string;
  documentIds: string[];
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** QA 消息 */
export interface QaMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  citedChunks: CitedChunk[];
  tokenUsage: { prompt?: number; completion?: number; total?: number };
  createdAt: string;
}

/** 引用 chunk 信息 */
export interface CitedChunk {
  chunkId: string;
  documentId: string;
  content: string;
  similarity: number;
}

/** 搜索请求参数 */
export interface SearchParams {
  query: string;
  documentIds?: string[];
  topK?: number;
}

/** 搜索返回的匹配结果 */
export interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  similarity: number;
  documentTitle: string;
}
