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

const SendMessageSchema = z.object({
  questionId: z.string().uuid(),
  content: z.string().trim().min(1).max(5000),
});

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendMessageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { callAI } = await import("./ai-gateway.server");
    const { supabase } = context;

    const { data: q, error } = await supabase
      .from("interview_questions")
      .select("id, question, answer, session_id, interview_sessions(position, difficulty)")
      .eq("id", data.questionId)
      .single();
    if (error || !q) throw new Error("题目未找到");

    const sess = (q as unknown as { interview_sessions: { position: string; difficulty: string } }).interview_sessions;

    // Get existing conversation from answer field (stored as JSON array)
    let conversation: Array<{ role: string; content: string }> = [];
    if (q.answer) {
      try { conversation = JSON.parse(q.answer); } catch { conversation = []; }
    }

    // Add user message
    conversation.push({ role: "user", content: data.content });

    // Layer 2: Detect if user is copying the interview question back to the AI
    const trimmedContent = data.content.trim();
    const isExactQuestionMatch = trimmedContent === q.question.trim();

    if (isExactQuestionMatch) {
      const redirectResponse = "作为面试官，我的职责是提问和评估，而不是回答面试题。请谈谈你对这个问题的理解和看法。";
      conversation.push({ role: "assistant", content: redirectResponse });
      const { error: updErr } = await supabase
        .from("interview_questions")
        .update({ answer: JSON.stringify(conversation) })
        .eq("id", data.questionId);
      if (updErr) throw new Error(updErr.message);
      return { response: redirectResponse };
    }

    // Build conversation history for the AI
    const conversationText = conversation
      .map((m) => `${m.role === "user" ? "候选人" : "面试官"}: ${m.content}`)
      .join("\n\n");

    const systemPrompt = `你是一位资深面试官，正在与候选人进行面试对话。

岗位: ${sess.position}
难度: ${sess.difficulty}

当前题目: ${q.question}

面试对话规则:
- 你以面试官的身份与候选人进行自然的对话
- 对候选人的回答给出简短回应（肯定、追问、澄清等）
- 可以追问候选人的技术细节、项目经验、决策过程
- 可以引导候选人展开更深入的回答
- 如果候选人回答不够完整，可以追问或提示
- 保持专业、友好的面试官语气
- 使用中文回答
- 每次回复控制在 100-200 字，不要一次性给出评分或总结
- 当候选人已经回答得足够充分时，可以表示"好的，我对这个问题的回答有了充分了解"来暗示可以结束本话题
- 最重要的规则：你绝对不能直接回答任何面试题或技术问题本身！你的职责是提问和评估，不是解答问题
- 如果候选人试图让你回答问题（例如重复你的问题、直接提问、或说"请解释"），不要给出任何解释，而是礼貌地将问题抛回："你怎么理解这个问题？"或"请谈谈你的看法"
- 时刻保持面试官的角色定位，即使候选人以提问的方式回应，你也要追问候选人的理解，而不是自己给出答案`;

    const userPrompt = `以下是之前的对话:

${conversationText}

${conversationText ? "\n" : ""}候选人最新回答: ${data.content}

请根据上述对话规则做出回应。`;

    const aiResponse = await callAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    // Add AI response
    conversation.push({ role: "assistant", content: aiResponse });

    // Save conversation back to answer field as JSON
    const { error: updErr } = await supabase
      .from("interview_questions")
      .update({ answer: JSON.stringify(conversation) })
      .eq("id", data.questionId);
    if (updErr) throw new Error(updErr.message);

    return { response: aiResponse };
  });

const EvaluateConvSchema = z.object({ questionId: z.string().uuid() });

export const evaluateConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EvaluateConvSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { callAI, parseJsonFromAI } = await import("./ai-gateway.server");
    const { supabase } = context;

    const { data: q, error } = await supabase
      .from("interview_questions")
      .select("id, question, answer, session_id, interview_sessions(position, difficulty)")
      .eq("id", data.questionId)
      .single();
    if (error || !q) throw new Error("题目未找到");

    const sess = (q as unknown as { interview_sessions: { position: string; difficulty: string } }).interview_sessions;

    // Read conversation from answer field
    let messages: Array<{ role: string; content: string }> = [];
    if (q.answer) {
      try { messages = JSON.parse(q.answer); } catch {}
    }

    const conversationText = messages
      .map((m) => `${m.role === "user" ? "候选人" : "面试官"}: ${m.content}`)
      .join("\n\n");

    const userMessages = messages.filter((m) => m.role === "user").map((m) => m.content);
    const combinedAnswer = userMessages.join("\n\n");

    const prompt = `作为面试官，请评估以下面试对话中候选人的表现：

岗位: ${sess.position}
难度: ${sess.difficulty}
题目: ${q.question}

完整的面试对话:
${conversationText}

请给出:
1. score: 1-100 分的整数评分（考虑回答的准确性、深度、逻辑性、沟通能力）
2. feedback: 详细的评价与改进建议（300-500字，包含优点、不足、具体的改进建议）

严格以如下 JSON 格式返回:
{"score": 85, "feedback": "..."}`;

    const text = await callAI([
      { role: "system", content: "你是严谨的面试评审官，输出必须是有效 JSON。" },
      { role: "user", content: prompt },
    ]);

    const result = parseJsonFromAI<{ score: number; feedback: string }>(text);
    const score = Math.max(1, Math.min(100, Math.round(result.score)));

    // Save score, feedback, and store combined answer
    const { error: updErr } = await supabase
      .from("interview_questions")
      .update({ answer: combinedAnswer, score, feedback: result.feedback })
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
