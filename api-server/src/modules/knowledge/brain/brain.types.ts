/**
 * 知识库 Brain 模块：类型定义
 */

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

/** 创建知识库输入 */
export interface BrainCreateInput {
  name: string;
  description?: string;
  systemPrompt?: string | null;
  embeddingProvider?: string;
}

/** 更新知识库输入 */
export interface BrainUpdateInput {
  name?: string;
  description?: string;
  systemPrompt?: string | null;
}

/** 知识库-文档关联记录 */
export interface BrainDocumentLink {
  brainId: string;
  documentId: string;
  createdAt: string;
}

/** 知识库列表响应 */
export interface BrainListResponse {
  brains: Brain[];
}

/** 单个知识库响应（含文档列表） */
export interface BrainDetailResponse {
  brain: Brain;
  documentIds: string[];
}
