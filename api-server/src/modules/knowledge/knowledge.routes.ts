/** 知识库模块：RESTful 路由 — 文档 CRUD + QA 问答 + 知识图谱 */

import { Hono } from "hono";
import { stream } from "hono/streaming";
import { requireAuth, type AuthVariables } from "../../shared/auth/require-auth.js";
import { createModuleLogger } from "../../shared/logger/voice-logger.js";
import { searchKnowledge } from "./search.service.js";
import { registerBuiltinProcessors } from "./processor/index.js";
import { registerBuiltinSplitters } from "./splitter/index.js";
import { brain } from "./brain/brain.routes.js";

/** 模块初始化：注册所有内置的 Processor */
registerBuiltinProcessors();
/** 模块初始化：注册所有内置的 Splitter */
registerBuiltinSplitters();

import {
  processDocumentUpload,
  createFromText,
  getDocumentList,
  removeDocument,
} from "./knowledge.service.js";
import {
  createQaSession,
  getQaSessionList,
  getQaSessionById,
  updateQaSession,
  deleteQaSession,
  getQaMessages,
  askQuestionStream as qaAskQuestionStream,
} from "./qa.service.js";
import { getGraphData, getBacklinksForChunk, rebuildAllGraphEdges } from "./graph.service.js";
import {
  UploadDocumentSchema,
  CreateQaSessionSchema,
  UpdateQaSessionSchema,
  GraphQuerySchema,
  SearchSchema,
  AskQuestionSchema,
  BatchDeleteDocumentsSchema,
} from "./knowledge.schemas.js";

const logger = createModuleLogger("knowledge-routes");

const knowledge = new Hono<{ Variables: AuthVariables }>();

knowledge.use("*", requireAuth);

// ============================================================
// Document CRUD
// ============================================================

/** 上传文档（接收 JSON：base64 编码的 content 或纯文本） */
knowledge.post("/documents", async (c) => {
  const input = UploadDocumentSchema.parse(await c.req.json());
  // 解码 data:URL 格式的 base64 内容
  const decodedContent = decodeDataUrl(input.content);
  const docId = await processDocumentUpload(c.var.supabase, c.var.userId, {
    title: input.title,
    content: decodedContent,
    fileName: input.fileName,
    fileType: input.fileType,
    fileSize: input.fileSize,
    fileHash: input.fileHash,
  });
  return c.json({ id: docId });
});

/** 通过纯文本创建文档 */
knowledge.post("/documents/text", async (c) => {
  const input = UploadDocumentSchema.parse(await c.req.json());
  const docId = await createFromText(c.var.supabase, c.var.userId, {
    title: input.title,
    content: input.content,
  });
  return c.json({ id: docId });
});

/** 获取文档列表 */
knowledge.get("/documents", async (c) => {
  const docs = await getDocumentList(c.var.supabase, c.var.userId);
  return c.json({ documents: docs });
});

/** 删除文档 */
knowledge.delete("/documents/:id", async (c) => {
  await removeDocument(c.var.supabase, c.req.param("id"));
  return c.json({ success: true });
});

/** 批量删除文档 */
knowledge.post("/documents/batch-delete", async (c) => {
  const { ids } = BatchDeleteDocumentsSchema.parse(await c.req.json());
  for (const id of ids) {
    await removeDocument(c.var.supabase, id);
  }
  return c.json({ success: true, deletedCount: ids.length });
});

// ============================================================
// QA Sessions
// ============================================================

/** 创建 QA 会话 */
knowledge.post("/qa/sessions", async (c) => {
  const input = CreateQaSessionSchema.parse(await c.req.json());
  const session = await createQaSession(c.var.supabase, c.var.userId, input);
  return c.json({ session });
});

/** 获取 QA 会话列表 */
knowledge.get("/qa/sessions", async (c) => {
  const sessions = await getQaSessionList(c.var.supabase, c.var.userId);
  return c.json({ sessions });
});

/** 获取单个 QA 会话 */
knowledge.get("/qa/sessions/:id", async (c) => {
  const session = await getQaSessionById(c.var.supabase, c.req.param("id"));
  if (!session) return c.json({ error: "问答会话不存在" }, 404);
  const messages = await getQaMessages(c.var.supabase, c.req.param("id"));
  return c.json({ session, messages });
});

/** 更新 QA 会话 */
knowledge.patch("/qa/sessions/:id", async (c) => {
  const input = UpdateQaSessionSchema.parse(await c.req.json());
  await updateQaSession(c.var.supabase, c.req.param("id"), input);
  return c.json({ success: true });
});

/** 删除 QA 会话 */
knowledge.delete("/qa/sessions/:id", async (c) => {
  await deleteQaSession(c.var.supabase, c.req.param("id"));
  return c.json({ success: true });
});

/** 提问（SSE 流式返回） */
/** 知识库 Brain 路由 */
knowledge.route("/brains", brain);

/** 知识库分享组件 */
knowledge.post("/qa/sessions/:id/ask", async (c) => {
  const { question } = AskQuestionSchema.parse(await c.req.json());

  // SSE 流式返回
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  return stream(c, async (s) => {
    s.onAbort(() => {
      logger.warn("SSE 流式提问客户端断开连接");
    });
    try {
      for await (const event of qaAskQuestionStream(
        c.var.supabase,
        c.var.userId,
        c.req.param("id"),
        question,
      )) {
        await s.write(`data: ${event}\n\n`);
      }
    } catch (err) {
      logger.error(err instanceof Error ? err : new Error("SSE 流式提问失败"), {
        operation: "stream_knowledge_answer",
      });
      await s.write(
        `data: ${JSON.stringify({ type: "error", content: err instanceof Error ? err.message : "未知错误" })}\n\n`,
      );
    }
  });
});

// ============================================================
// Knowledge Search
// ============================================================

/** 搜索知识库（直接返回 chunks，不调 LLM）*/
knowledge.post("/search", async (c) => {
  const { query, documentIds, topK } = SearchSchema.parse(await c.req.json());
  const results = await searchKnowledge(c.var.supabase, c.var.userId, query, {
    documentIds,
    topK,
  });
  return c.json({ results });
});

// ============================================================
// Knowledge Graph
// ============================================================

/** 获取知识图谱数据 */
knowledge.get("/graph", async (c) => {
  const query = GraphQuerySchema.parse({
    minSimilarity: Number(c.req.query("minSimilarity") ?? 0.7),
    documentIds: c.req.query("documentIds")?.split(",").filter(Boolean),
  });
  const graphData = await getGraphData(c.var.supabase, c.var.userId, query);
  return c.json(graphData);
});

/** 获取某个 chunk 的反链 */
knowledge.get("/graph/node/:chunkId", async (c) => {
  const minSimilarity = Number(c.req.query("minSimilarity") ?? 0.7);
  const backlinks = await getBacklinksForChunk(
    c.var.supabase,
    c.req.param("chunkId"),
    minSimilarity,
  );
  return c.json({ backlinks });
});

/** 手动触发全量反链重建 */
knowledge.put("/graph/rebuild", async (c) => {
  const count = await rebuildAllGraphEdges(c.var.supabase, c.var.userId);
  return c.json({ edgesCreated: count });
});

export { knowledge };

/** 解码 data:URL base64 为原始内容
 *  例如 "data:application/pdf;base64,JVBERi0..." → Buffer (PDF/DOCX) 或 string (TXT/MD) */
function decodeDataUrl(dataUrl: string): string | Buffer {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return dataUrl; // 已经是纯文本
  const base64 = match[1];
  const buffer = Buffer.from(base64, "base64");
  // 对于 txt/md 返回 UTF-8 字符串
  return buffer;
}
