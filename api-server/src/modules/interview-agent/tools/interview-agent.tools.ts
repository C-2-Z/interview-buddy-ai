/** Interview Agent v1 允许的内部只读工具端口与固定 allowlist。 */
import type { SkillDef } from "../../skills/skill.types.js";
import type {
  AgentDifficulty,
  InterviewAgentState,
} from "../interview-agent.types.js";
import type {
  AgentQuestionCandidate,
  AgentResumeSummary,
} from "./preparation.types.js";

/** Agent v1 唯一允许注册的内部工具名称。 */
export const ALLOWED_AGENT_TOOL_NAMES = [
  "load_skill",
  "load_resume_summary",
  "search_question_bank",
  "load_session_messages",
  "load_rubric",
  "web_search",
] as const;

/** 允许的内部工具名称。 */
export type AllowedAgentToolName = (typeof ALLOWED_AGENT_TOOL_NAMES)[number];

/** 准备阶段使用的只读工具端口；不开放任意 SQL、shell 或外部写操作。 */
export interface InterviewAgentTools {
  /**
   * 加载项目内预定义 Skill。
   *
   * @param skillId - 创建配置中的 Skill ID；null 表示通用岗位。
   * @returns 只读 Skill 定义或 null。
   */
  loadSkill(skillId: string | null): Promise<SkillDef | null>;

  /**
   * 加载用户自有简历的有限结构化摘要。
   *
   * @param resumeId - 创建配置中的简历 UUID；null 表示无简历。
   * @returns 不含完整文件和 parsed_text 的摘要或 null。
   */
  loadResumeSummary(resumeId: string | null): Promise<AgentResumeSummary | null>;

  /**
   * 从公共题库读取有限候选，不在工具内作流程决定。
   *
   * @param input - 岗位、难度和最大候选数。
   * @returns 题库候选。
   */
  searchQuestionBank(input: {
    position: string;
    difficulty: AgentDifficulty;
    limit: number;
  }): Promise<AgentQuestionCandidate[]>;

  /**
   * 加载会话已持久化消息引用；Phase 2 准备阶段通常为空。
   *
   * @param sessionId - Agent 会话 UUID。
   * @returns 不含原始音频的消息 ID 列表。
   */
  loadSessionMessages(sessionId: string): Promise<string[]>;

  /**
   * 加载冻结量表维度键。
   *
   * @param state - 当前核心 Agent State。
   * @returns 允许证据和评分使用的维度键。
   */
  loadRubric(state: InterviewAgentState): Promise<string[]>;

}

/**
 * 检查工具注册表没有越过 v1 allowlist。
 *
 * @param names - 待注册工具名。
 * @returns 原始名称数组。
 */
export function assertAllowedAgentTools(
  names: readonly string[],
): readonly string[] {
  const allowed = new Set<string>(ALLOWED_AGENT_TOOL_NAMES);
  if (names.some((name) => !allowed.has(name))) {
    throw new Error("Agent tool registry contains a forbidden tool");
  }
  return names;
}
