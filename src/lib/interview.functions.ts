import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CreateSessionSchema = z.object({
  position: z.string().trim().min(1).max(100),
  difficulty: z.enum(["初级", "中级", "高级"]),
  background: z.string().trim().max(2000).optional().default(""),
  questionCount: z.number().int().min(3).max(10).default(5),
});

export const createInterviewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSessionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { callAI, parseJsonFromAI } = await import("./ai-gateway.server");
    const { supabase, userId } = context;

    const prompt = `你是一位资深的技术面试官。请为以下候选人生成 ${data.questionCount} 道面试题。

岗位: ${data.position}
难度: ${data.difficulty}
候选人背景: ${data.background || "未提供"}

要求:
- 题目要贴合岗位和难度
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
      throw new Error("生成的题目格式错误");
    }

    const { data: session, error } = await supabase
      .from("interview_sessions")
      .insert({
        user_id: userId,
        position: data.position,
        difficulty: data.difficulty,
        background: data.background,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const rows = questions.map((q, i) => ({
      session_id: session.id,
      order_index: i,
      question: q,
    }));
    const { error: qErr } = await supabase.from("interview_questions").insert(rows);
    if (qErr) throw new Error(qErr.message);

    return { sessionId: session.id as string };
  });

const EvaluateSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.string().trim().min(1).max(5000),
});

export const evaluateAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EvaluateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { callAI, parseJsonFromAI } = await import("./ai-gateway.server");
    const { supabase } = context;

    const { data: q, error } = await supabase
      .from("interview_questions")
      .select("id, question, session_id, interview_sessions(position, difficulty)")
      .eq("id", data.questionId)
      .single();
    if (error || !q) throw new Error("题目未找到");

    const sess = (q as unknown as { interview_sessions: { position: string; difficulty: string } }).interview_sessions;

    const prompt = `作为面试官，请评估以下回答：

岗位: ${sess.position}
难度: ${sess.difficulty}
题目: ${q.question}
候选人回答: ${data.answer}

请给出:
1. score: 1-100 分的整数评分
2. feedback: 详细的评价与改进建议（200-400字，包含优点、不足、改进建议）

严格以如下 JSON 格式返回:
{"score": 85, "feedback": "..."}`;

    const text = await callAI([
      { role: "system", content: "你是严谨的面试评审官，输出必须是有效 JSON。" },
      { role: "user", content: prompt },
    ]);

    const result = parseJsonFromAI<{ score: number; feedback: string }>(text);
    const score = Math.max(1, Math.min(100, Math.round(result.score)));

    const { error: updErr } = await supabase
      .from("interview_questions")
      .update({ answer: data.answer, score, feedback: result.feedback })
      .eq("id", data.questionId);
    if (updErr) throw new Error(updErr.message);

    return { score, feedback: result.feedback };
  });

const FinishSchema = z.object({ sessionId: z.string().uuid() });

export const finishSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FinishSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: qs, error } = await supabase
      .from("interview_questions")
      .select("score, feedback, question")
      .eq("session_id", data.sessionId);
    if (error) throw new Error(error.message);

    const scored = (qs ?? []).filter((q) => q.score != null);
    const avg = scored.length
      ? Math.round(scored.reduce((s, q) => s + (q.score ?? 0), 0) / scored.length)
      : 0;

    let overall = "";
    if (scored.length > 0) {
      const { callAI } = await import("./ai-gateway.server");
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
      .eq("id", data.sessionId);
    if (updErr) throw new Error(updErr.message);

    return { overallScore: avg, overallFeedback: overall };
  });

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("interview_sessions")
      .select("id, position, difficulty, status, overall_score, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const GetSchema = z.object({ sessionId: z.string().uuid() });

export const getSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: s, error } = await context.supabase
      .from("interview_sessions")
      .select("*")
      .eq("id", data.sessionId)
      .single();
    if (error) throw new Error(error.message);

    const { data: qs, error: qErr } = await context.supabase
      .from("interview_questions")
      .select("*")
      .eq("session_id", data.sessionId)
      .order("order_index");
    if (qErr) throw new Error(qErr.message);

    return { session: s, questions: qs ?? [] };
  });
