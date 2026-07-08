import { Hono } from "hono";
import {
  requireAuth,
  type AuthVariables,
} from "../../shared/auth/require-auth.js";
import {
  createInterviewSession,
  finishSession,
  getSession,
  listSessions,
} from "./sessions.service.js";
import { CreateSessionSchema } from "./sessions.schemas.js";

const sessions = new Hono<{ Variables: AuthVariables }>();

sessions.use("*", requireAuth);

sessions.post("/", async (c) => {
  const input = CreateSessionSchema.parse(await c.req.json());
  const result = await createInterviewSession({
    supabase: c.var.supabase,
    userId: c.var.userId,
    input,
  });
  return c.json(result);
});

sessions.get("/", async (c) => {
  const result = await listSessions(c.var.supabase);
  return c.json(result);
});

sessions.get("/:id", async (c) => {
  const result = await getSession(c.var.supabase, c.req.param("id"));
  return c.json(result);
});

sessions.post("/:id/finish", async (c) => {
  const result = await finishSession({
    supabase: c.var.supabase,
    userId: c.var.userId,
    sessionId: c.req.param("id"),
  });
  return c.json(result);
});

export { sessions };

