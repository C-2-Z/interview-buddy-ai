import { Hono } from "hono";
import {
  requireAuth,
  type AuthVariables,
} from "../../shared/auth/require-auth.js";
import {
  getSettings,
  updateSettings,
} from "./settings.service.js";
import { UpdateSettingsSchema } from "./settings.schemas.js";

const settings = new Hono<{ Variables: AuthVariables }>();

settings.use("*", requireAuth);

settings.get("/", async (c) => {
  const result = await getSettings(c.var.supabase, c.var.userId);
  return c.json(result);
});

settings.put("/", async (c) => {
  const body = UpdateSettingsSchema.parse(await c.req.json());
  const result = await updateSettings(c.var.supabase, c.var.userId, body);
  return c.json(result);
});

export { settings };

