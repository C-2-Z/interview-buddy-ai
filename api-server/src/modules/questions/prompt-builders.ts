import { parseJsonFromAI } from "../../shared/ai/json-parser.js";

export type InterviewContext = {
  position: string;
  difficulty: string;
  jobDescription: string | null;
  question: string;
};

function jobDescriptionInfo(jobDescription: string | null): string {
  return jobDescription?.trim()
    ? `\n岗位需求描述: ${jobDescription}`
    : "";
}

export function buildInterviewerSystemPrompt(ctx: InterviewContext): string {
  return `你是一位资深面试官，正在进行证据深挖型面试。

面试上下文:
- 岗位: ${ctx.position}
- 难度: ${ctx.difficulty}${jobDescriptionInfo(ctx.jobDescription)}
- 当前题目: ${ctx.question}

追问决策规则:
- 先判断候选人最新回答的最大缺口：概念准确性、真实经验、技术细节、取舍依据、边界条件、指标结果、风险处理。
- 每轮只提出 1 个核心追问，必须贴合当前题目、岗位、难度、岗位需求描述和候选人最新回答。
- 初级追问概念理解、基础例子、简单场景；中级追问实现细节、方案取舍、故障处理、项目经验；高级追问架构权衡、规模化、风险控制、业务影响、团队协作。
- 禁止直接回答面试题，禁止提前评分，禁止一次问多个问题，避免“能详细说说吗”这类泛问。
- 如果候选人复制题目、要求你解释答案或让你代答，拒绝作答并把问题抛回给候选人。

结束判断:
- 当候选人的回答已经足够支撑评分，请严格输出 JSON，不要输出其他文字:
{"type":"complete","summary":"我对这个问题已经有了足够了解，可以进入评分或下一题。"}

输出约束:
- 如果还需要追问，只输出面试官下一句话，不输出分析过程、Markdown 或列表。
- 正常追问控制在 80-160 字。`;
}

export function buildInterviewerUserPrompt(
  conversationText: string,
  latestAnswer: string,
): string {
  const history = conversationText
    ? `历史对话:\n${conversationText}\n\n`
    : "";
  return `${history}候选人最新回答:
${latestAnswer}

请只输出面试官下一句话。`;
}

export const EVALUATION_SYSTEM_PROMPT =
  "你是严谨的面试评审官，输出必须是有效 JSON。";

export function buildEvaluationPrompt(
  ctx: InterviewContext,
  conversationText: string,
): string {
  return `作为面试官，请评估以下面试对话中候选人的表现：

岗位: ${ctx.position}
难度: ${ctx.difficulty}${jobDescriptionInfo(ctx.jobDescription)}
题目: ${ctx.question}

完整的面试对话:
${conversationText}

请给出:
1. score: 1-100 分的整数评分（考虑回答的准确性、深度、逻辑性、沟通能力，以及岗位需求匹配度）
2. feedback: 详细的评价与改进建议（300-500字，包含优点、不足、具体的改进建议）

严格以如下 JSON 格式返回:
{"score": 85, "feedback": "..."}`;
}

export function parseCompletionSignal(
  text: string,
): { summary: string } | null {
  try {
    const parsed = parseJsonFromAI<{ type: string; summary?: string }>(text);
    if (parsed?.type === "complete") {
      return { summary: parsed.summary ?? "" };
    }
  } catch {
    return null;
  }
  return null;
}

