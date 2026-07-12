/** Interview Agent 候选人输入的确定性空值、复制、注入和长度 Guard。 */

/** Guard 拒绝继续证据流程时使用的稳定原因。 */
export type AgentInputGuardReason =
  | "empty_input"
  | "input_too_long"
  | "copied_question"
  | "prompt_injection";

/** Guard 的判别结果；原始回答始终留在业务消息表。 */
export type AgentInputGuardResult =
  | { disposition: "valid"; reason: null }
  | { disposition: "redirect"; reason: AgentInputGuardReason };

/** Guard 检查所需的有限业务输入。 */
export type GuardAgentInput = {
  /** 已持久化的候选人回答。 */
  content: string;
  /** 当前业务题目正文。 */
  question: string;
  /** HTTP 与语音统一使用的最大文本字符数。 */
  maxLength?: number;
};

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions?/i,
  /reveal\s+(the\s+)?(system|developer)\s+prompt/i,
  /(?:system|developer)\s*(?:message|prompt)\s*[:：]/i,
  /act\s+as\s+(?:the\s+)?(?:system|developer)/i,
  /忽略(?:之前|以上|先前|所有).{0,12}(?:指令|规则|要求)/i,
  /(?:泄露|输出|显示).{0,12}(?:系统|开发者).{0,8}(?:提示词|指令)/i,
  /(?:系统|开发者)(?:消息|提示词|指令)\s*[:：]/i,
] as const;

/**
 * 规范题目比较文本，消除空白、标点和大小写差异但保留中日韩字符。
 *
 * @param value - 回答或题目文本。
 * @returns 适合复制检测的规范文本。
 */
function normalizeComparableText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
}

/**
 * 判断回答是否直接复述完整题目；短题必须完全相等，避免普通关键词误报。
 *
 * @param content - 候选人回答。
 * @param question - 当前题目。
 * @returns 是否构成复制题目。
 */
function isCopiedQuestion(content: string, question: string): boolean {
  const normalizedContent = normalizeComparableText(content);
  const normalizedQuestion = normalizeComparableText(question);
  if (!normalizedContent || !normalizedQuestion) return false;
  if (normalizedQuestion.length < 12) {
    return normalizedContent === normalizedQuestion;
  }
  return normalizedContent.includes(normalizedQuestion);
}

/**
 * 以确定性代码检查输入，模型不能覆盖 Guard 结果或改变长度边界。
 *
 * 检查顺序刻意固定：空值 → 长度 → 复制题目 → 提示注入。这样客户端与审计日志在多种
 * 问题同时出现时仍得到同一个稳定原因，且原始正文不会写入 checkpoint。
 *
 * @param input - 业务表加载的回答与当前题目。
 * @returns 继续证据流程或引导候选人重新回答的判别结果。
 */
export function guardAgentInput(input: GuardAgentInput): AgentInputGuardResult {
  const maxLength = input.maxLength ?? 5_000;
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new RangeError("maxLength must be a positive integer");
  }
  const content = input.content.trim();
  if (!content) return { disposition: "redirect", reason: "empty_input" };
  if (content.length > maxLength) {
    return { disposition: "redirect", reason: "input_too_long" };
  }
  if (isCopiedQuestion(content, input.question)) {
    return { disposition: "redirect", reason: "copied_question" };
  }
  if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(content))) {
    return { disposition: "redirect", reason: "prompt_injection" };
  }
  return { disposition: "valid", reason: null };
}

/**
 * 将稳定 Guard 原因映射为不泄露答案或内部 Prompt 的中文引导语。
 *
 * @param reason - Guard 判定原因。
 * @returns 面试官可直接发送的一句话 redirect。
 */
export function buildInputRedirect(reason: AgentInputGuardReason): string {
  switch (reason) {
    case "empty_input":
      return "请结合你自己的经历或思考，给出一个具体回答。";
    case "input_too_long":
      return "回答内容较长，请精炼关键背景、行动和结果后重新作答。";
    case "copied_question":
      return "请不要复述题目，结合你的实际经历说明思路和做法。";
    case "prompt_injection":
      return "我只能继续当前面试，请直接回答题目并说明你的真实经验。";
  }
}
