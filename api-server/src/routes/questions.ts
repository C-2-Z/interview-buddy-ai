import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { callAI, parseJsonFromAI } from "../lib/ai-gateway.js";

const questions = new Hono<{
  Variables: { userId: string; supabase: ReturnType<typeof import("../lib/supabase.js").createUserClient> };
}>();

questions.use("*", requireAuth);

/** POST /api/questions/:questionId/message — Send a message in multi-turn conversation */
questions.post("/:questionId/message", async (c) => {
  const supabase = c.var.supabase;
  const questionId = c.req.param("questionId");

  const schema = z.object({
    content: z.string().trim().min(1).max(5000),
  });
  const body = schema.parse(await c.req.json());

  const { data: q, error } = await supabase
    .from("interview_questions")
    .select("id, question, answer, session_id, interview_sessions(position, difficulty, job_description)")
    .eq("id", questionId)
    .single();
  if (error || !q) return c.json({ error: "题目未找到" }, 404);

  const sess = (q as unknown as { interview_sessions: { position: string; difficulty: string; job_description: string | null } }).interview_sessions;

  // Read existing conversation from answer field (stored as JSON array)
  let conversation: Array<{ role: string; content: string }> = [];
  if (q.answer) {
    try { conversation = JSON.parse(q.answer); } catch { conversation = []; }
  }

  conversation.push({ role: "user", content: body.content });

  // Detect if user is copying the interview question back to the AI
  if (body.content.trim() === q.question.trim()) {
    const redirectResponse =
      "作为面试官，我的职责是提问和评估，而不是回答面试题。请谈谈你对这个问题的理解和看法。";
    conversation.push({ role: "assistant", content: redirectResponse });
    await supabase
      .from("interview_questions")
      .update({ answer: JSON.stringify(conversation) })
      .eq("id", questionId);
    return c.json({ response: redirectResponse });
  }

  const conversationText = conversation
    .map((m) => `${m.role === "user" ? "候选人" : "面试官"}: ${m.content}`)
    .join("\n\n");
  const jobDescriptionInfo = sess.job_description?.trim()
    ? `\n岗位需求描述: ${sess.job_description}`
    : "";

  const systemPrompt = `你是一位资深面试官，正在与候选人进行面试对话。

岗位: ${sess.position}
难度: ${sess.difficulty}${jobDescriptionInfo}

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

${conversationText ? "\n" : ""}候选人最新回答: ${body.content}

请根据上述对话规则做出回应。`;

  const aiResponse = await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  conversation.push({ role: "assistant", content: aiResponse });

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

  const { data: q, error } = await supabase
    .from("interview_questions")
    .select("id, question, answer, session_id, interview_sessions(position, difficulty, job_description)")
    .eq("id", questionId)
    .single();
  if (error || !q) return c.json({ error: "题目未找到" }, 404);

  const sess = (q as unknown as { interview_sessions: { position: string; difficulty: string; job_description: string | null } }).interview_sessions;

  let messages: Array<{ role: string; content: string }> = [];
  if (q.answer) {
    try { messages = JSON.parse(q.answer); } catch {}
  }

  const conversationText = messages
    .map((m) => `${m.role === "user" ? "候选人" : "面试官"}: ${m.content}`)
    .join("\n\n");

  const userMessages = messages.filter((m) => m.role === "user").map((m) => m.content);
  const combinedAnswer = userMessages.join("\n\n");
  const jobDescriptionInfo = sess.job_description?.trim()
    ? `\n岗位需求描述: ${sess.job_description}`
    : "";

  const prompt = `作为面试官，请评估以下面试对话中候选人的表现：

岗位: ${sess.position}
难度: ${sess.difficulty}${jobDescriptionInfo}
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

  await supabase
    .from("interview_questions")
    .update({ answer: combinedAnswer, score, feedback: result.feedback })
    .eq("id", questionId);

  return c.json({ score, feedback: result.feedback });
});

export { questions };
