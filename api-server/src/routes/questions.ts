import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { callAI, parseJsonFromAI, type ModelProvider, type ProviderName } from "../lib/ai-gateway.js";
import {
  buildInterviewerSystemPrompt,
  buildInterviewerUserPrompt,
  buildEvaluationPrompt,
  formatConversation,
  buildRedirectResponse,
  parseCompletionSignal,
  EVALUATION_SYSTEM_PROMPT,
} from "../lib/prompts.js";

const questions = new Hono<{
  Variables: { userId: string; supabase: ReturnType<typeof import("../lib/supabase.js").createUserClient> };
}>();

questions.use("*", requireAuth);

/** POST /api/questions/:questionId/message — Send a message in multi-turn conversation */
questions.post("/:questionId/message", async (c) => {
  const supabase = c.var.supabase;
  const questionId = c.req.param("questionId");
  const userId = c.var.userId;

  const schema = z.object({
    content: z.string().trim().min(1).max(5000),
  });
  const body = schema.parse(await c.req.json());

  const { data: q, error } = await supabase
    .from("interview_questions")
    .select("id, question, answer, session_id, interview_sessions(position, difficulty, background, model_provider, model_name)")
    .eq("id", questionId)
    .single();
  if (error || !q) return c.json({ error: "题目未找到" }, 404);

  const sess = (q as unknown as { interview_sessions: { position: string; difficulty: string; background: string | null; model_provider: string | null; model_name: string | null } }).interview_sessions;
  const modelProvider: ModelProvider = {
    name: (sess.model_provider as ProviderName) || "deepseek",
    model: sess.model_name || "",
  };

  // Read existing conversation from answer field (stored as JSON array)
  let conversation: Array<{ role: string; content: string }> = [];
  if (q.answer) {
    try { conversation = JSON.parse(q.answer); } catch { conversation = []; }
  }

  conversation.push({ role: "user", content: body.content });

  // Detect if user is copying the interview question back to the AI
  if (body.content.trim() === q.question.trim()) {
    const redirectResponse = buildRedirectResponse();
    conversation.push({ role: "assistant", content: redirectResponse });
    await supabase
      .from("interview_questions")
      .update({ answer: JSON.stringify(conversation) })
      .eq("id", questionId);
    return c.json({ response: redirectResponse });
  }

  const conversationText = formatConversation(conversation);
  const ctx = {
    position: sess.position,
    difficulty: sess.difficulty,
    jobDescription: sess.background,
    question: q.question,
  };
  const systemPrompt = buildInterviewerSystemPrompt(ctx);
  const userPrompt = buildInterviewerUserPrompt(conversationText, body.content);

  const aiResponse = await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], modelProvider);

  conversation.push({ role: "assistant", content: aiResponse });

  // Check if AI signaled that the conversation is complete
  const completionSignal = parseCompletionSignal(aiResponse);
  if (completionSignal) {
    // Replace the JSON signal with a natural closing response
    const closingResponse = `感谢你的回答。${completionSignal.summary}下面我们进入下一题。`;
    conversation[conversation.length - 1] = {
      role: "assistant",
      content: closingResponse,
    };

    // Auto-run evaluation using the conversation (without the closing line)
    const evalConversationText = formatConversation(
      conversation.filter((m) => m.content !== closingResponse),
    );
    const evalPrompt = buildEvaluationPrompt(ctx, evalConversationText);

    const evalText = await callAI([
      { role: "system", content: EVALUATION_SYSTEM_PROMPT },
      { role: "user", content: evalPrompt },
    ], modelProvider);
    const evalResult = parseJsonFromAI<{ score: number; feedback: string }>(evalText);
    const score = Math.max(1, Math.min(100, Math.round(evalResult.score)));

    // Save conversation + evaluation to DB
    const userMessages = conversation
      .filter((m) => m.role === "user")
      .map((m) => m.content);
    const combinedAnswer = userMessages.join("\n\n");
    await supabase
      .from("interview_questions")
      .update({
        answer: combinedAnswer,
        score,
        feedback: evalResult.feedback,
      })
      .eq("id", questionId)
      .eq("session_id", q.session_id);

    return c.json({
      response: closingResponse,
      done: true,
      score,
      feedback: evalResult.feedback,
    });
  }

  await supabase
    .from("interview_questions")
    .update({ answer: JSON.stringify(conversation) })
    .eq("id", questionId);

  return c.json({ response: aiResponse });
});

/** POST /api/questions/:questionId/evaluate — Evaluate conversation and score */
questions.post("/:questionId/evaluate", async (c) => {
  const supabase = c.var.supabase;
  const questionId = c.req.param("questionId");
  const userId = c.var.userId;

  const { data: q, error } = await supabase
    .from("interview_questions")
    .select("id, question, answer, session_id, interview_sessions(position, difficulty, background, model_provider, model_name)")
    .eq("id", questionId)
    .single();
  if (error || !q) return c.json({ error: "题目未找到" }, 404);

  const sess = (q as unknown as { interview_sessions: { position: string; difficulty: string; background: string | null; model_provider: string | null; model_name: string | null } }).interview_sessions;
  const modelProvider: ModelProvider = {
    name: (sess.model_provider as ProviderName) || "deepseek",
    model: sess.model_name || "",
  };

  let messages: Array<{ role: string; content: string }> = [];
  if (q.answer) {
    try { messages = JSON.parse(q.answer); } catch {}
  }

  const conversationText = formatConversation(messages);

  const userMessages = messages.filter((m) => m.role === "user").map((m) => m.content);
  const combinedAnswer = userMessages.join("\n\n");

  const prompt = buildEvaluationPrompt(
    {
      position: sess.position,
      difficulty: sess.difficulty,
      jobDescription: sess.background,
      question: q.question,
    },
    conversationText,
  );

  const text = await callAI([
    { role: "system", content: EVALUATION_SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ], modelProvider);

  const result = parseJsonFromAI<{ score: number; feedback: string }>(text);
  const score = Math.max(1, Math.min(100, Math.round(result.score)));

  await supabase
    .from("interview_questions")
    .update({ answer: combinedAnswer, score, feedback: result.feedback })
    .eq("id", questionId);

  return c.json({ score, feedback: result.feedback });
});

export { questions };
