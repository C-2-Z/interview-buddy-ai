/** Interview Agent Phase 4 冻结评分报告类型。 */
import type { FrozenRubricDimension } from "../evaluation/evaluation.types.js";

/** 报告读取的一题冻结评分。 */
export type FrozenQuestionScore = {
  /** 题目 UUID。 */ questionId: string;
  /** 全场题号。 */ orderIndex: number;
  /** 角色。 */ roleId: "general" | "technical" | "manager" | "hr";
  /** 代码计算总分。 */ overallScore: number;
  /** 冻结维度分；未观察维度不参与聚合。 */ dimensions: Record<string, {
    status: "scored" | "not_observed";
    score: number | null;
    evidenceIds: string[];
  }>;
};

/** 前端雷达图兼容的维度聚合。 */
export type AgentDimensionSummary = {
  /** 聚合维度。 */
  dimensions: Record<string, {
    score: number;
    count: number;
    weight: number;
    evidenceCoverageCount: number;
  }>;
  /** 冻结加权总分。 */ overallScore: number;
  /** 表现最好维度展示文本。 */ strengths: string[];
  /** 待改进维度展示文本。 */ weaknesses: string[];
};

/** 报告生成上下文。 */
export type AgentReportContext = {
  /** 会话 UUID。 */ sessionId: string;
  /** 创建题数。 */ questionCount: number;
  /** 冻结量表。 */ rubric: FrozenRubricDimension[];
  /** 全部已完成题目评分。 */ questions: FrozenQuestionScore[];
  /** 研究来源数量，用于报告附录提示。 */ researchSourceCount: number;
};

/** 可原子提交的最终报告。 */
export type FrozenAgentReport = {
  /** 会话 UUID。 */ sessionId: string;
  /** ISO 8601 完成时间。 */ completedAt: string;
  /** 综合分。 */ overallScore: number;
  /** 不重新调用模型的确定性总评。 */ overallFeedback: string;
  /** 雷达图兼容汇总。 */ dimensionSummary: AgentDimensionSummary;
  /** 实际冻结评分题数。 */ questionCount: number;
  /** 研究附录来源数量。 */ researchSourceCount: number;
};

/** 报告提交 receipt。 */
export type AgentReportReceipt = {
  /** 首次提交。 */ committed: boolean;
  /** 幂等重放。 */ duplicate: boolean;
  /** 固定操作键。 */ operationKey: "finalize:report";
  /** 会话 UUID。 */ sessionId: string;
  /** 综合分。 */ overallScore: number;
  /** 完成事件序号。 */ eventSequence: number;
};
