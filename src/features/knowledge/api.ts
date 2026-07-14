/** 知识库模块：API 调用函数 — 文档 CRUD + QA + 图谱 */

import { apiRequest } from "@/shared/api/http-client";
import { apiBaseUrl } from "@/shared/api/http-client";
import { getAccessToken } from "@/shared/api/auth-token";
import type {
  KnowledgeDocument,
  QaSession,
  QaMessage,
  GraphData,
  BacklinkDetail,
  DocFileType,
  Brain,
  CreateBrainParams,
  AddDocumentsToBrainParams,
  SearchResult,
} from "./types";

// ============================================================
// Knowledge Search
// ============================================================

/** 搜索知识库（直接返回 chunks，不调 LLM）*/
export function searchKnowledgeAPI(params: {
  query: string;
  documentIds?: string[];
  topK?: number;
}): Promise<{ results: SearchResult[] }> {
  return apiRequest("POST", "/api/knowledge/search", params);
}

// ============================================================
// Brains (知识库)
// ============================================================

/** 获取或创建默认知识库 */
export function getDefaultBrain(): Promise<{ brain: Brain }> {
  return apiRequest("GET", "/api/knowledge/brains/default");
}

/** 获取用户的所有知识库 */
export function listBrains(): Promise<{ brains: Brain[] }> {
  return apiRequest("GET", "/api/knowledge/brains");
}

/** 创建知识库 */
export function createBrain(params: CreateBrainParams): Promise<{ brain: Brain }> {
  return apiRequest("POST", "/api/knowledge/brains", params);
}

/** 获取知识库详情（含文档 ID 列表）*/
export function getBrainDetail(id: string): Promise<{ brain: Brain; documentIds: string[] }> {
  return apiRequest("GET", `/api/knowledge/brains/${id}`);
}

/** 删除知识库 */
export function deleteBrain(id: string): Promise<{ success: boolean }> {
  return apiRequest("DELETE", `/api/knowledge/brains/${id}`);
}

/** 关联文档到知识库 */
export function addDocumentsToBrain(
  id: string,
  params: AddDocumentsToBrainParams,
): Promise<{ success: boolean }> {
  return apiRequest("POST", `/api/knowledge/brains/${id}/documents`, params);
}

// ============================================================
// Documents
// ============================================================

/** 上传文档 */
export function uploadDocument(params: {
  title: string;
  content: string;
  fileName?: string;
  fileType: DocFileType;
  fileSize?: number;
  fileHash?: string;
}): Promise<{ id: string }> {
  return apiRequest("POST", "/api/knowledge/documents", params);
}

/** 获取文档列表 */
export function listDocuments(): Promise<{ documents: KnowledgeDocument[] }> {
  return apiRequest("GET", "/api/knowledge/documents");
}

/** 删除文档 */
export function deleteDocument(id: string): Promise<{ success: boolean }> {
  return apiRequest("DELETE", `/api/knowledge/documents/${id}`);
}

/** 批量删除文档 */
export function batchDeleteDocuments(
  ids: string[],
): Promise<{ success: boolean; deletedCount: number }> {
  return apiRequest("POST", "/api/knowledge/documents/batch-delete", { ids });
}

// ============================================================
// QA Sessions
// ============================================================

/** 创建 QA 会话 */
export function createQaSession(params: {
  title?: string;
  documentIds?: string[];
}): Promise<{ session: QaSession }> {
  return apiRequest("POST", "/api/knowledge/qa/sessions", params);
}

/** 获取 QA 会话列表 */
export function listQaSessions(): Promise<{ sessions: QaSession[] }> {
  return apiRequest("GET", "/api/knowledge/qa/sessions");
}

/** 获取单个 QA 会话（含消息） */
export function getQaSession(id: string): Promise<{ session: QaSession; messages: QaMessage[] }> {
  return apiRequest("GET", `/api/knowledge/qa/sessions/${id}`);
}

/** 删除 QA 会话 */
export function deleteQaSession(id: string): Promise<{ success: boolean }> {
  return apiRequest("DELETE", `/api/knowledge/qa/sessions/${id}`);
}

/** 流式提问（SSE），通过回调逐块接收增量内容
 *  @returns AbortController 用于取消正在进行的请求 */
export function askQuestionStream(
  sessionId: string,
  question: string,
  callbacks: {
    onDelta: (text: string) => void;
    onMeta: (data: {
      citedChunks: Array<{
        chunkId: string;
        documentId: string;
        content: string;
        similarity: number;
      }>;
      fullAnswer: string;
    }) => void;
    onError: (error: string) => void;
  },
): AbortController {
  const controller = new AbortController();
  void (async () => {
    try {
      const token = await getAccessToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${apiBaseUrl}/api/knowledge/qa/sessions/${sessionId}/ask`, {
        method: "POST",
        headers,
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });
      if (!response.ok) {
        callbacks.onError(`请求失败 (${response.status})，请稍后重试。`);
        return;
      }
      if (!response.body) {
        callbacks.onError("服务未返回可读取的回答流，请重试。");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // 最后一段可能跨网络分块，必须留到下一轮才能解析。
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
            if (data.type === "delta" && typeof data.content === "string") {
              callbacks.onDelta(data.content);
            } else if (data.type === "meta") {
              callbacks.onMeta(data as Parameters<typeof callbacks.onMeta>[0]);
            } else if (data.type === "error" && typeof data.content === "string") {
              callbacks.onError(data.content);
            }
          } catch {
            // 忽略单个损坏事件，后续完整 SSE 事件仍可继续消费。
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      callbacks.onError("知识问答连接中断，请检查网络后重试。");
    }
  })();

  return controller;
}

// ============================================================
// Knowledge Graph
// ============================================================

/** 获取图谱数据 */
export function getGraphData(params?: {
  minSimilarity?: number;
  documentIds?: string[];
}): Promise<GraphData> {
  const searchParams = new URLSearchParams();
  if (params?.minSimilarity !== undefined) {
    searchParams.set("minSimilarity", String(params.minSimilarity));
  }
  if (params?.documentIds && params.documentIds.length > 0) {
    searchParams.set("documentIds", params.documentIds.join(","));
  }
  const qs = searchParams.toString();
  return apiRequest("GET", `/api/knowledge/graph${qs ? `?${qs}` : ""}`);
}

/** 获取某个 chunk 的反链 */
export function getBacklinks(
  chunkId: string,
  minSimilarity?: number,
): Promise<{ backlinks: BacklinkDetail[] }> {
  const qs = minSimilarity !== undefined ? `?minSimilarity=${minSimilarity}` : "";
  return apiRequest("GET", `/api/knowledge/graph/node/${chunkId}${qs}`);
}

/** 全量重建图边 */
export function rebuildGraph(): Promise<{ edgesCreated: number }> {
  return apiRequest("PUT", "/api/knowledge/graph/rebuild");
}
