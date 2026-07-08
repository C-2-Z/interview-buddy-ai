import { Hono } from "hono";
import {
  requireAuth,
  type AuthVariables,
} from "../../shared/auth/require-auth.js";
import {
  evaluateQuestionConversation,
  sendMessage,
} from "./questions.service.js";
import { SendMessageSchema } from "./questions.schemas.js";

const questions = new Hono<{ Variables: AuthVariables }>();

questions.use("*", requireAuth);

questions.post("/:questionId/message", async (c) => {
  const body = SendMessageSchema.parse(await c.req.json());
  const result = await sendMessage({
    supabase: c.var.supabase,
    userId: c.var.userId,
    questionId: c.req.param("questionId"),
    content: body.content,
  });
  if ("error" in result) return c.json({ error: result.error }, 404);
  return c.json(result);
});

questions.post("/:questionId/evaluate", async (c) => {
  const result = await evaluateQuestionConversation({
    supabase: c.var.supabase,
    userId: c.var.userId,
    questionId: c.req.param("questionId"),
  });
  if ("error" in result) return c.json({ error: result.error }, 404);
  return c.json(result);
});

export { questions };

