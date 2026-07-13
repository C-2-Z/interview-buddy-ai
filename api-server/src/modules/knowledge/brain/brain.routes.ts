/**
 * 知识库 Brain 模块：RESTful 路由 — 知识库 CRUD + 文档关联
 */

import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../../../shared/auth/require-auth.js";
import { createModuleLogger } from "../../voice/voice-logger.js";
import {
  getBrains,
  createBrain,
  getBrainDetail,
  updateBrain,
  deleteBrain,
  getOrCreateDefaultBrain,
  addDocuments,
  removeDocument,
} from "./brain.service.js";
import {
  CreateBrainSchema,
  UpdateBrainSchema,
  AddDocumentsToBrainSchema,
} from "./brain.schemas.js";

const logger = createModuleLogger("brain-routes");

const brain = new Hono<{ Variables: AuthVariables }>();

brain.use("*", requireAuth);

// ============================================================
// Brain CRUD
// ============================================================

/** 获取或创建默认知识库
 *  放在 /default 而非 /:id 之前，避免路由冲突 */
brain.get("/default", async (c) => {
  const result = await getOrCreateDefaultBrain(c.var.supabase, c.var.userId);
  return c.json({ brain: result });
});

/** 获取用户的所有知识库 */
brain.get("/", async (c) => {
  const brains = await getBrains(c.var.supabase, c.var.userId);
  return c.json({ brains });
});

/** 创建知识库 */
brain.post("/", async (c) => {
  const input = CreateBrainSchema.parse(await c.req.json());
  const result = await createBrain(c.var.supabase, c.var.userId, input);
  return c.json({ brain: result }, 201);
});

/** 获取知识库详情 */
brain.get("/:id", async (c) => {
  const result = await getBrainDetail(c.var.supabase, c.req.param("id"));
  if (!result) return c.json({ error: "知识库不存在" }, 404);
  return c.json(result);
});

/** 更新知识库 */
brain.patch("/:id", async (c) => {
  const input = UpdateBrainSchema.parse(await c.req.json());
  await updateBrain(c.var.supabase, c.req.param("id"), input);
  return c.json({ success: true });
});

/** 删除知识库 */
brain.delete("/:id", async (c) => {
  await deleteBrain(c.var.supabase, c.req.param("id"));
  return c.json({ success: true });
});

// ============================================================
// Brain-Document 关联
// ============================================================

/** 关联文档到知识库 */
brain.post("/:id/documents", async (c) => {
  const input = AddDocumentsToBrainSchema.parse(await c.req.json());
  await addDocuments(c.var.supabase, c.req.param("id"), input.documentIds);
  return c.json({ success: true });
});

/** 从知识库移除文档 */
brain.delete("/:id/documents/:docId", async (c) => {
  await removeDocument(c.var.supabase, c.req.param("id"), c.req.param("docId"));
  return c.json({ success: true });
});

export { brain };
