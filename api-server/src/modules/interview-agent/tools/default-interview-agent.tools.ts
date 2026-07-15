/** Interview Agent 3 只读工具的生产实现与固定注册表。 */
import { findSkill } from "../../skills/skills.service.js";
import type { InterviewAgentState } from "../interview-agent.types.js";
import {
  ALLOWED_AGENT_TOOL_NAMES,
  assertAllowedAgentTools,
  type InterviewAgentTools,
} from "./interview-agent.tools.js";
import type { InterviewPreparationRepository } from "./preparation.repository.js";

/**
 * 将项目内 Skill 与用户作用域 Repository 组合为唯一允许的只读工具集合。
 *
 * @param repository - 只暴露明确查询的准备 Repository。
 * @returns 不包含 SQL、shell、写操作或模型自注册能力的工具实现。
 */
export function createDefaultInterviewAgentTools(
  repository: InterviewPreparationRepository,
): InterviewAgentTools {
  // 启动时断言注册表没有被无意扩展；Web Search 由独立 Provider 实现同名受控能力。
  assertAllowedAgentTools(ALLOWED_AGENT_TOOL_NAMES);
  return {
    async loadSkill(skillId) {
      return findSkill(skillId ?? undefined) ?? null;
    },
    async loadResumeSummary(resumeId) {
      return repository.loadResumeSummary(resumeId);
    },
    async searchQuestionBank(input) {
      return repository.searchQuestionBank(input);
    },
    async loadSessionMessages(sessionId) {
      return repository.loadSessionMessageIds(sessionId);
    },
    async loadRubric(state: InterviewAgentState) {
      // Phase 2 尚未冻结评分表；先返回已覆盖维度，空状态使用通用五维契约。
      return state.coveredDimensions.length > 0
        ? [...state.coveredDimensions]
        : ["technical_depth", "problem_solving", "communication", "ownership", "learning"];
    },
  };
}
