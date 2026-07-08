/**
 * Prompt templates for the AI interviewer.
 * All prompt logic is centralized here for consistency, maintainability,
 * and easy tuning of the AI's interviewing behavior.
 */
import { parseJsonFromAI } from "./ai-gateway.js";

export interface InterviewContext {
  position: string;
  difficulty: string;
  jobDescription: string | null;
  question: string;
}

function jdInfo(jobDescription: string | null): string {
  return jobDescription?.trim() ? `\n岗位需求描述: ${jobDescription}` : "";
}

/**
 * System prompt for the interviewer AI during multi-turn conversation.
 * The AI acts as an interviewer, provides follow-ups, and can signal
 * when the candidate has answered sufficiently.
 *
 * When the AI judges the conversation complete, it MUST output ONLY a JSON
 * object — no surrounding text — so the backend can auto-trigger evaluation.
 */
export function buildInterviewerSystemPrompt(ctx: InterviewContext): string {
  return `你是一位资深面试官，正在与候选人进行面试对话。

岗位: ${ctx.position}
难度: ${ctx.difficulty}${jdInfo(ctx.jobDescription)}

当前题目: ${ctx.question}

面试对话规则:
- 你以面试官的身份与候选人进行自然的对话
- 对候选人的回答给出简短回应（肯定、追问、澄清等）
- 可以追问候选人的技术细节、项目经验、决策过程
- 保持专业、友好的面试官语气
- 使用中文回答
- 每次回复控制在 100-200 字

结束对话判断标准（当候选人满足以下条件时，可以结束当前题目）：
1. 候选人已经完整回答题目的核心要点，无需再追问
2. 候选人在你的追问下展现了足够的思维深度和技术理解
3. 候选人展示了清晰的逻辑表达和沟通能力
4. 你对该候选人的能力已经有了充分判断，不需要继续追问

【重要输出规则】
- 如果你认为候选人还需要更多追问，正常以面试官语气回复即可，不使用 JSON 格式。
- 如果你判断对话可以结束，请严格按照以下 JSON 格式回复（不要包含其他任何内容）：
{"type":"complete","summary":"对候选人回答的简短总结（30-60字）"}`;
}

/**
 * User prompt that provides conversation history and the latest answer.
 */
export function buildInterviewerUserPrompt(
  conversationText: string,
  latestAnswer: string,
): string {
  const history = conversationText
    ? `以下是之前的对话:\n\n${conversationText}\n\n`
    : "";
  return `${history}候选人最新回答: ${latestAnswer}

请根据面试对话规则做出回应。`;
}

/**
 * Evaluation prompt for scoring a completed conversation.
 * Expects a JSON response with score (1-100) and feedback text.
 */
export function buildEvaluationPrompt(
  ctx: InterviewContext,
  conversationText: string,
): string {
  return `作为面试官，请评估以下面试对话中候选人的表现：

岗位: ${ctx.position}
难度: ${ctx.difficulty}${jdInfo(ctx.jobDescription)}
题目: ${ctx.question}

完整的面试对话:
${conversationText}

请给出:
1. score: 1-100 分的整数评分（考虑回答的准确性、深度、逻辑性、沟通能力）
2. feedback: 详细的评价与改进建议（300-500字，包含优点、不足、具体的改进建议）

严格以如下 JSON 格式返回:
{"score": 85, "feedback": "..."}`;
}

/**
 * Prompt for generating interview questions at session creation.
 */
export function buildQuestionGenerationPrompt(params: {
  position: string;
  difficulty: string;
  jobDescription: string;
  questionCount: number;
  targetCompany?: string;
}): string {
  const { position, difficulty, jobDescription, questionCount } = params;
  let companyHint = "";
  if (params.targetCompany) {
    companyHint = `\n目标公司: ${params.targetCompany}\n请根据该公司的面试风格和侧重点来出题。`;
  }

  return `你是一位资深的技术面试官。请为以下候选人生成 ${questionCount} 道面试题。

岗位: ${position}
难度: ${difficulty}
岗位需求描述: ${jobDescription || "未提供"}${companyHint}

要求:
- 题目要贴合岗位和难度
- 涵盖技术、行为、场景等不同类型
- 每道题独立、清晰、具体

请严格以 JSON 数组格式返回，只包含题目文本，例如:
["题目1", "题目2", "题目3"]`;
}

/**
 * Try to parse the AI response as a completion signal.
 * Returns null if the response is a normal follow-up (not JSON or wrong type).
 */
export function parseCompletionSignal(
  text: string,
): { summary: string } | null {
  try {
    const parsed = parseJsonFromAI<{ type: string; summary?: string }>(text);
    if (parsed && parsed.type === "complete") {
      return { summary: parsed.summary ?? "" };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build a formatted conversation text from message history for use in prompts.
 */
export function formatConversation(
  messages: Array<{ role: string; content: string }>,
): string {
  return messages
    .map((m) => `${m.role === "user" ? "候选人" : "面试官"}: ${m.content}`)
    .join("\n\n");
}

/**
 * Build the "redirect" response when user copies the question back to the AI.
 */
export function buildRedirectResponse(): string {
  return "作为面试官，我的职责是提问和评估，而不是回答面试题。请谈谈你对这个问题的理解和看法。";
}

/**
 * System prompt used in the evaluation call.
 */
export const EVALUATION_SYSTEM_PROMPT =
  "你是严谨的面试评审官，输出必须是有效 JSON。";

/**
 * System prompt used in question generation call.
 */
export const QUESTION_GEN_SYSTEM_PROMPT =
  "你是专业的面试官助手，回答必须是有效的 JSON。";

/**
 * System prompt used in the session finish / overall summary call.
 */
export const FINISH_SYSTEM_PROMPT =
  "你是资深面试官，用中文给出简洁总结。";
