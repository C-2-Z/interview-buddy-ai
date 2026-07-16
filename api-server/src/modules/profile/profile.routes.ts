/** profile：用户资料 HTTP 路由 */
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../../shared/auth/require-auth.js";
import { readProfile, removeAvatar, saveProfile, uploadAvatar } from "./profile.service.js";
import { UpdateProfileSchema } from "./profile.schemas.js";
const profile = new Hono<{ Variables: AuthVariables }>();
profile.use("*", requireAuth);
profile.get("/", async (c) => c.json(await readProfile(c.var.supabase, c.var.userId)));
profile.put("/", async (c) => c.json(await saveProfile(c.var.supabase, c.var.userId, UpdateProfileSchema.parse(await c.req.json()))));
profile.post("/avatar", async (c) => { const body = await c.req.parseBody(); if (!(body.file instanceof File)) return c.json({ error: "请上传头像文件" }, 400); return c.json(await uploadAvatar(c.var.supabase, c.var.userId, body.file)); });
profile.delete("/avatar", async (c) => c.json(await removeAvatar(c.var.supabase, c.var.userId)));
export { profile };
