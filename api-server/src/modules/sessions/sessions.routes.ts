/** 面试场次 RESTful 路由 */
import { Hono } from "hono";
import {
  requireAuth,
  type AuthVariables,
} from "../../shared/auth/require-auth.js";
import {
  finishSession,
  getSession,
  listSessions,
} from "./sessions.service.js";
import { createCompatibleInterviewSession } from "./agent-compat.service.js";
import { CreateSessionSchema } from "./sessions.schemas.js";

const sessions = new Hono<{ Variables: AuthVariables }>();

sessions.use("*", requireAuth);

sessions.post("/", async (c) => {
  const input = CreateSessionSchema.parse(await c.req.json());
  const result = await createCompatibleInterviewSession({
    supabase: c.var.supabase,
    userId: c.var.userId,
    input: { ...input, interviewMode: "text" },
  });
  return "generationStatus" in result || "phase" in result
    ? c.json(result, 202)
    : c.json(result);
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

