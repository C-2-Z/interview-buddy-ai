import { Hono } from "hono";
import {
  requireAuth,
  type AuthVariables,
} from "../../shared/auth/require-auth.js";
import { listSessionMessages } from "../questions/messages.repository.js";
import { createVoiceSocketToken } from "./voice-token.service.js";
import { voiceError, voiceLog } from "./voice-logger.js";
import {
  assertVoiceSessionAccess,
} from "./voice.repository.js";
import { CreateVoiceSessionSchema } from "./voice.schemas.js";
import {
  createVoiceInterviewSession,
  finishVoiceSession,
  getVoiceSession,
} from "./voice.service.js";

const voice = new Hono<{ Variables: AuthVariables }>();

voice.use("*", requireAuth);

voice.onError((err, c) => {
  voiceError("voice_route_failed", err, {
    path: c.req.path,
    method: c.req.method,
  });
  return c.json(
    {
      error: err.message,
      code: "VOICE_ROUTE_FAILED",
    },
    500,
  );
});

voice.post("/sessions", async (c) => {
  const input = CreateVoiceSessionSchema.parse(await c.req.json());
  voiceLog("voice_session_create_start", {
    userId: c.var.userId,
    position: input.position,
    difficulty: input.difficulty,
    questionCount: input.questionCount,
    skillId: input.skillId,
  });
  const result = await createVoiceInterviewSession({
    supabase: c.var.supabase,
    userId: c.var.userId,
    input,
  });
  voiceLog("voice_session_create_done", {
    userId: c.var.userId,
    sessionId: result.sessionId,
  });
  return c.json(result);
});

voice.get("/sessions/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  voiceLog("voice_session_get", { sessionId, userId: c.var.userId });
  const result = await getVoiceSession({
    supabase: c.var.supabase,
    sessionId,
  });
  return c.json(result);
});

voice.post("/sessions/:sessionId/connect", async (c) => {
  const sessionId = c.req.param("sessionId");
  voiceLog("voice_session_connect_start", { sessionId, userId: c.var.userId });
  await assertVoiceSessionAccess(c.var.supabase, sessionId);

  const authHeader = c.req.header("authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");
  const { token, expiresAt } = createVoiceSocketToken({
    sessionId,
    userId: c.var.userId,
    accessToken,
  });
  const url = new URL(c.req.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/voice/ws";
  url.search = `?token=${encodeURIComponent(token)}`;

  voiceLog("voice_session_connect_done", {
    sessionId,
    userId: c.var.userId,
    expiresAt,
  });
  return c.json({
    token,
    wsUrl: url.toString(),
    expiresAt,
  });
});

voice.get("/sessions/:sessionId/messages", async (c) => {
  const sessionId = c.req.param("sessionId");
  voiceLog("voice_session_messages", { sessionId, userId: c.var.userId });
  await assertVoiceSessionAccess(c.var.supabase, sessionId);
  const messages = await listSessionMessages(c.var.supabase, sessionId);
  return c.json({ messages });
});

voice.post("/sessions/:sessionId/end", async (c) => {
  const sessionId = c.req.param("sessionId");
  voiceLog("voice_session_end_start", { sessionId, userId: c.var.userId });
  const result = await finishVoiceSession({
    supabase: c.var.supabase,
    userId: c.var.userId,
    sessionId,
  });
  voiceLog("voice_session_end_done", {
    sessionId,
    userId: c.var.userId,
    overallScore: result.overallScore,
  });
  return c.json(result);
});

export { voice };
