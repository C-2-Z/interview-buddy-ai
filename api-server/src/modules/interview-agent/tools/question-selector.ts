/** Interview Agent 题库优先、模型兜底和重复主题过滤。 */
import type { AgentDifficulty, RoleId } from "../interview-agent.types.js";
import type { AgentQuestionCandidate } from "./preparation.types.js";

/** 动态选题所需的确定性上下文。 */
export type SelectQuestionInput = {
  /** 目标岗位。 */
  position: string;
  /** 冻结难度。 */
  difficulty: AgentDifficulty;
  /** 当前固定角色。 */
  roleId: RoleId;
  /** 当前题目的主能力维度。 */
  dimensionKey: string;
  /** 已使用题目 ID。 */
  excludedQuestionIds: ReadonlySet<string>;
  /** 已使用题目规范文本，防止同题不同 ID。 */
  excludedQuestionTexts: ReadonlySet<string>;
  /** 已覆盖主题或标签。 */
  excludedTopicKeys: ReadonlySet<string>;
};

/**
 * 规范化题目或标签，用于大小写、空白和标点无关去重。
 *
 * @param value - 原始题目、岗位或标签。
 * @returns 小写字母数字与中日韩字符组成的规范文本。
 */
export function normalizeQuestionTopic(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, "")
    .trim();
}

/**
 * 计算岗位词元重叠；中文岗位以规范字符串包含关系补充判断。
 *
 * @param candidate - 候选题岗位。
 * @param target - 会话目标岗位。
 * @returns 0–3 的稳定匹配分。
 */
function positionMatchScore(candidate: string, target: string): number {
  const left = normalizeQuestionTopic(candidate);
  const right = normalizeQuestionTopic(target);
  if (!left || !right) return 0;
  if (left === right) return 3;
  if (left.includes(right) || right.includes(left)) return 2;
  const tokens = new Set(candidate.toLowerCase().split(/[^a-z0-9\u3400-\u9fff]+/));
  const targetTokens = target
    .toLowerCase()
    .split(/[^a-z0-9\u3400-\u9fff]+/)
    .filter(Boolean);
  return targetTokens.some((token) => tokens.has(token)) ? 1 : 0;
}

/**
 * 计算题库候选分数，流程控制只使用冻结字段和标签。
 *
 * @param candidate - 题库候选题。
 * @param input - 当前角色、维度、岗位和难度。
 * @returns 分数越高越优先。
 */
function candidateScore(
  candidate: AgentQuestionCandidate,
  input: SelectQuestionInput,
): number {
  const normalizedTags = new Set(candidate.tags.map(normalizeQuestionTopic));
  const dimension = normalizeQuestionTopic(input.dimensionKey);
  const role = normalizeQuestionTopic(input.roleId);
  let score = positionMatchScore(candidate.position, input.position) * 3;
  if (candidate.difficulty === input.difficulty) score += 5;
  if (normalizedTags.has(dimension)) score += 10;
  if (normalizedTags.has(role)) score += 3;
  if (normalizeQuestionTopic(candidate.type) === dimension) score += 4;
  return score;
}

/**
 * 从题库候选中选择最高分且未重复的题目。
 *
 * @param candidates - Repository 返回的有限题库候选。
 * @param input - 当前确定性选题上下文。
 * @returns 最佳题库题目；没有合法候选时为 null。
 */
export function selectQuestionFromBank(
  candidates: readonly AgentQuestionCandidate[],
  input: SelectQuestionInput,
): AgentQuestionCandidate | null {
  return (
    candidates
      .filter((candidate) => candidate.source === "bank")
      .filter(
        (candidate) =>
          !input.excludedQuestionIds.has(candidate.id) &&
          !input.excludedQuestionTexts.has(
            normalizeQuestionTopic(candidate.question),
          ) &&
          !candidate.tags.some((tag) =>
            input.excludedTopicKeys.has(normalizeQuestionTopic(tag)),
          ),
      )
      .map((candidate) => ({
        candidate,
        score: candidateScore(candidate, input),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.candidate.id.localeCompare(right.candidate.id),
      )[0]?.candidate ?? null
  );
}

/**
 * 题库优先选择，只有无合法题时才调用模型兜底。
 *
 * @param candidates - 题库候选。
 * @param input - 当前选题上下文。
 * @param generateFallback - 延迟模型生成函数。
 * @returns 题库题或通过结构校验的模型题。
 */
export async function selectQuestionWithFallback(
  candidates: readonly AgentQuestionCandidate[],
  input: SelectQuestionInput,
  generateFallback: () => Promise<AgentQuestionCandidate>,
): Promise<AgentQuestionCandidate> {
  const bankQuestion = selectQuestionFromBank(candidates, input);
  if (bankQuestion) return bankQuestion;
  const generated = await generateFallback();
  if (
    generated.source !== "model" ||
    !generated.id.trim() ||
    !generated.question.trim() ||
    input.excludedQuestionIds.has(generated.id) ||
    input.excludedQuestionTexts.has(
      normalizeQuestionTopic(generated.question),
    )
  ) {
    throw new Error("Model fallback returned an invalid or duplicate question");
  }
  return generated;
}
