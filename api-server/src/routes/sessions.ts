import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { callAI, parseJsonFromAI, type ModelProvider, type ProviderName } from "../lib/ai-gateway.js";
import { buildQuestionGenerationPrompt, QUESTION_GEN_SYSTEM_PROMPT, FINISH_SYSTEM_PROMPT } from "../lib/prompts.js";

const sessions = new Hono<{
  Variables: { userId: string; supabase: ReturnType<typeof import("../lib/supabase.js").createUserClient> };
}>();

// All routes require auth
sessions.use("*", requireAuth);

/** POST /api/sessions — Create session + generate questions via AI */
sessions.post("/", async (c) => {
  const supabase = c.var.supabase;
  const userId = c.var.userId;

  const schema = z.object({
    position: z.string().trim().min(1).max(100),
    difficulty: z.enum(["初级", "中级", "高级"]),
    jobDescription: z.string().trim().max(2000).optional().default(""),
    questionCount: z.number().int().min(3).max(10).default(5),
    targetCompany: z.string().trim().max(100).optional().default(""),
    questionTypeConfig: z.record(z.number()).optional(),
    modelProvider: z.enum(["deepseek", "openai", "anthropic"]).optional().default("deepseek"),
    modelName: z.string().trim().max(100).optional(),
  });

  const body = schema.parse(await c.req.json());

  const modelProvider: ModelProvider = {
    name: body.modelProvider as ProviderName,
    model: body.modelName ?? "",
  };

  const prompt = buildQuestionGenerationPrompt({
    position: body.position,
    difficulty: body.difficulty,
    jobDescription: body.jobDescription,
    questionCount: body.questionCount,
    targetCompany: body.targetCompany,
  });

  const text = await callAI([
    { role: "system", content: QUESTION_GEN_SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ], modelProvider);

  const questions = parseJsonFromAI<string[]>(text);
  if (!Array.isArray(questions) || questions.length === 0) {
    return c.json({ error: "生成的题目格式错误" }, 500);
  }

  const { data: session, error } = await supabase
    .from("interview_sessions")
    .insert({
      user_id: userId,
      position: body.position,
      difficulty: body.difficulty,
      background: body.jobDescription,
      model_provider: body.modelProvider,
      ...(body.modelName ? { model_name: body.modelName } : {}),
      ...((body as any).targetCompany ? { target_company: (body as any).targetCompany } : {}),
      ...((body as any).resumeText ? { resume_text: (body as any).resumeText } : {}),
      ...((body as any).questionTypeConfig ? { question_type_config: (body as any).questionTypeConfig } : {}),
    } as any)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);

  const rows = questions.map((q, i) => ({
    session_id: session.id,
    order_index: i,
    question: q,
  }));
  const { error: qErr } = await supabase.from("interview_questions").insert(rows);
  if (qErr) return c.json({ error: qErr.message }, 500);

  return c.json({ sessionId: session.id });
});

/** GET /api/sessions — List all sessions for current user */
sessions.get("/", async (c) => {
  const supabase = c.var.supabase;
  const { data, error } = await supabase
    .from("interview_sessions")
    .select("id, position, difficulty, status, overall_score, created_at")
    .order("created_at", { ascending: false });
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

/** GET /api/sessions/:id — Get session with questions */
sessions.get("/:id", async (c) => {
  const supabase = c.var.supabase;
  const id = c.req.param("id");

  const { data: s, error } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return c.json({ error: error.message }, 404);

  const { data: qs, error: qErr } = await supabase
    .from("interview_questions")
    .select("*")
    .eq("session_id", id)
    .order("order_index");
  if (qErr) return c.json({ error: qErr.message }, 500);

  return c.json({ session: s, questions: qs ?? [] });
});

/** POST /api/sessions/:id/finish — Finish session and generate overall feedback */
sessions.post("/:id/finish", async (c) => {
  const supabase = c.var.supabase;
  const id = c.req.param("id");

  // Load session to get model config
  const { data: sessionRow } = await supabase
    .from("interview_sessions")
    .select("model_provider, model_name")
    .eq("id", id)
    .single() as any;

  const sessionData = sessionRow as any;
  const finishProvider: ModelProvider = {
    name: (sessionData?.model_provider as ProviderName) ?? "deepseek",
    model: (sessionData?.model_name as string) ?? "",
  };

  const { data: qs, error } = await supabase
    .from("interview_questions")
    .select("score, feedback, question")
    .eq("session_id", id);
  if (error) return c.json({ error: error.message }, 500);

  const scored = (qs ?? []).filter((q) => q.score != null);
  const avg = scored.length
    ? Math.round(scored.reduce((s, q) => s + (q.score ?? 0), 0) / scored.length)
    : 0;

  let overall = "";
  if (scored.length > 0) {
    overall = await callAI([
      { role: "system", content: FINISH_SYSTEM_PROMPT },
      {
        role: "user",
        content: `以下是候选人各题得分与反馈，请总结整体表现、亮点与改进方向（200-300字）：\n${scored
          .map((q, i) => `Q${i + 1}(得分${q.score}): ${q.feedback}`)
          .join("\n\n")}`,
      },
    ], finishProvider);
  }

  const { error: updErr } = await supabase
    .from("interview_sessions")
    .update({ status: "completed", overall_score: avg, overall_feedback: overall })
    .eq("id", id);
  if (updErr) return c.json({ error: updErr.message }, 500);

  return c.json({ overallScore: avg, overallFeedback: overall });
});

export { sessions };
