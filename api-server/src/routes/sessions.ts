import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { callAI, parseJsonFromAI } from "../lib/ai-gateway.js";

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
    background: z.string().trim().max(2000).optional().default(""),
    questionCount: z.number().int().min(3).max(10).default(5),
  });

  const body = schema.parse(await c.req.json());

  const prompt = `你是一位资深的技术面试官。请为以下岗位的招聘生成 ${body.questionCount} 道面试题。

岗位: ${body.position}
难度: ${body.difficulty}
岗位需求描述: ${body.background || "未提供"}

要求:
- 题目要贴合岗位和难度
- 紧扣岗位职责和技术要求，确保能筛选出符合该岗位要求的候选人
- 涵盖技术、行为、场景等不同类型
- 每道题独立、清晰、具体

请严格以 JSON 数组格式返回，只包含题目文本，例如:
["题目1", "题目2", "题目3"]`;

  const text = await callAI([
    { role: "system", content: "你是专业的面试官助手，回答必须是有效的 JSON。" },
    { role: "user", content: prompt },
  ]);

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
      background: body.background,
    })
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
      { role: "system", content: "你是资深面试官，用中文给出简洁总结。" },
      {
        role: "user",
        content: `以下是候选人各题得分与反馈，请总结整体表现、亮点与改进方向（200-300字）：\n${scored
          .map((q, i) => `Q${i + 1}(得分${q.score}): ${q.feedback}`)
          .join("\n\n")}`,
      },
    ]);
  }

  const { error: updErr } = await supabase
    .from("interview_sessions")
    .update({ status: "completed", overall_score: avg, overall_feedback: overall })
    .eq("id", id);
  if (updErr) return c.json({ error: updErr.message }, 500);

  return c.json({ overallScore: avg, overallFeedback: overall });
});

export { sessions };
