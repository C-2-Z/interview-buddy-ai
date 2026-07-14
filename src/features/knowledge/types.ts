/** 知识库模块：前端类型定义 */

/** 文档文件类型 */
export type DocFileType = "pdf" | "docx" | "txt" | "md";

/** 文档状态 */
export type DocStatus = "processing" | "ready" | "failed";

/** 知识库文档 */
export interface KnowledgeDocument {
  id: string;
  userId: string;
  title: string;
  fileName: string | null;
  fileType: DocFileType;
  fileSize: number | null;
  fileHash: string | null;
  source: string;
  docMetadata: Record<string, unknown>;
  chunkCount: number;
  status: DocStatus;
  errorMessage: string | null;
  createdAt: string;
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
  tokenUsage: Record<string, number | undefined>;
  createdAt: string;
}

/** 引用 chunk */
export interface CitedChunk {
  chunkId: string;
  documentId: string;
  content: string;
  similarity: number;
}

/** 向量检索命中的知识片段。 */
export interface SearchResult {
  /** 命中的 chunk UUID。 */
  chunkId: string;
  /** 所属文档 UUID。 */
  documentId: string;
  /** 可展示的纯文本片段。 */
  content: string;
  /** 余弦相似度，范围由数据库 RPC 保证。 */
  similarity: number;
  /** 所属文档标题。 */
  documentTitle: string;
}

/** 图谱节点 */
export interface GraphNode {
  id: string;
  label: string;
  type: "document" | "chunk";
  color: string;
  documentId?: string;
  size: number;
  content?: string;
}

/** 图谱连线 */
export interface GraphLink {
  source: string;
  target: string;
  value: number;
}

/** 图谱数据 */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** 反链详情 */
export interface BacklinkDetail {
  chunkId: string;
  content: string;
  similarity: number;
  documentTitle: string;
}

/** Tab 类型 */
export type KnowledgeTab = "documents" | "qa" | "graph";

// ============================================================
// Brain（知识库）
// ============================================================

/** 知识库（Brain）*/
export interface Brain {
  id: string;
  userId: string;
  name: string;
  description: string;
  systemPrompt: string | null;
  embeddingProvider: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 创建知识库请求 */
export interface CreateBrainParams {
  name: string;
  description?: string;
  systemPrompt?: string | null;
}

/** 关联文档到知识库请求 */
export interface AddDocumentsToBrainParams {
  documentIds: string[];
}
