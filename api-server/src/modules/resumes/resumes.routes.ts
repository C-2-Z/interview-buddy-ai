import { Hono } from "hono";
import { requireAuth } from "../../middleware/auth.js";
import {
  uploadResume,
  getUserResumes,
  getResume,
  deleteResume,
} from "./resumes.service.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const resumes = new Hono<{
  Variables: { userId: string; supabase: ReturnType<typeof import("../../shared/db/supabase.js").createUserClient> };
}>();

resumes.use("*", requireAuth);

/** POST /api/resumes — 上传并分析简历 */
resumes.post("/", async (c) => {
  const supabase = c.var.supabase;
  const userId = c.var.userId;

  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return c.json({ error: "未上传文件" }, 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: "文件大小不能超过 10MB" }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadResume(supabase, userId, {
      buffer,
      originalname: file.name,
      mimetype: file.type,
    });

    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "上传失败";
    return c.json({ error: message }, 400);
  }
});

/** GET /api/resumes — 列出用户简历 */
resumes.get("/", async (c) => {
  const supabase = c.var.supabase;
  const userId = c.var.userId;

  try {
    const list = await getUserResumes(supabase, userId);
    return c.json(list);
  } catch (err) {
    return c.json({ error: "获取列表失败" }, 500);
  }
});

/** GET /api/resumes/:id — 简历详情 */
resumes.get("/:id", async (c) => {
  const supabase = c.var.supabase;
  const id = c.req.param("id");

  try {
    const result = await getResume(supabase, id);
    if (!result) return c.json({ error: "简历未找到" }, 404);
    return c.json(result);
  } catch (err) {
    return c.json({ error: "获取失败" }, 500);
  }
});

/** DELETE /api/resumes/:id — 删除简历 */
resumes.delete("/:id", async (c) => {
  const supabase = c.var.supabase;
  const id = c.req.param("id");

  try {
    await deleteResume(supabase, id);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: "删除失败" }, 500);
  }
});

export { resumes };
