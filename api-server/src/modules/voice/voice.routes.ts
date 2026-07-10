import { Hono } from "hono";
import {
  requireAuth,
  type AuthVariables,
} from "../../shared/auth/require-auth.js";
import { listSessionMessages } from "../questions/messages.repository.js";
import { finishSession } from "../sessions/sessions.service.js";
import { createVoiceSocketToken } from "./voice-token.service.js";
import {
  assertSessionAccess,
  markSessionVoiceMode,
} from "./voice.repository.js";

const voice = new Hono<{ Variables: AuthVariables }>();

voice.use("*", requireAuth);

voice.post("/sessions/:sessionId/connect", async (c) => {
  const sessionId = c.req.param("sessionId");
  await assertSessionAccess(c.var.supabase, sessionId);
  await markSessionVoiceMode(c.var.supabase, sessionId);

  const authHeader = c.req.header("authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");
  const { token, expiresAt } = createVoiceSocketToken({
    sessionId,
    userId: c.var.userId,
    accessToken,
  });
  const url = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto") || url.protocol.replace(":", "");
  url.protocol = proto === "https" ? "wss:" : "ws:";
  url.pathname = "/api/voice/ws";
  url.search = `?token=${encodeURIComponent(token)}`;

  return c.json({
    token,
    wsUrl: url.toString(),
    expiresAt,
  });
});

voice.get("/sessions/:sessionId/messages", async (c) => {
  const sessionId = c.req.param("sessionId");
  await assertSessionAccess(c.var.supabase, sessionId);
  const messages = await listSessionMessages(c.var.supabase, sessionId);
  return c.json({ messages });
});

voice.post("/sessions/:sessionId/end", async (c) => {
  const sessionId = c.req.param("sessionId");
  await assertSessionAccess(c.var.supabase, sessionId);
  const result = await finishSession({
    supabase: c.var.supabase,
    userId: c.var.userId,
    sessionId,
  });
  return c.json(result);
});

export { voice };
