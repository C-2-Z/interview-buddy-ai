/** Interview session read-only routes */
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../../shared/auth/require-auth.js";
import { getSession, listSessions } from "./sessions.service.js";
import { SessionParamsSchema } from "./sessions.schemas.js";

const sessions = new Hono<{ Variables: AuthVariables }>();

sessions.use("*", requireAuth);

sessions.get("/", async (c) => {
  const result = await listSessions(c.var.supabase);
  return c.json(result);
});

sessions.get("/:id", async (c) => {
  const { id } = SessionParamsSchema.parse(c.req.param());
  const result = await getSession(c.var.supabase, id);
  return c.json(result);
});

export { sessions };
