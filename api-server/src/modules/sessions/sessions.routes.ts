/** Interview session read-only routes */
import { Hono } from "hono";
import {
  requireAuth,
  type AuthVariables,
} from "../../shared/auth/require-auth.js";
import {
  getSession,
  listSessions,
} from "./sessions.service.js";

const sessions = new Hono<{ Variables: AuthVariables }>();

sessions.use("*", requireAuth);

sessions.get("/", async (c) => {
  const result = await listSessions(c.var.supabase);
  return c.json(result);
});

sessions.get("/:id", async (c) => {
  const result = await getSession(c.var.supabase, c.req.param("id"));
  return c.json(result);
});

export { sessions };
