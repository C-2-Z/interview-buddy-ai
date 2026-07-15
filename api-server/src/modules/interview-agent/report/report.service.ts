/** Interview Agent Phase 4 只读取冻结评分的确定性报告聚合服务。 */
import type {
  AgentDimensionSummary,
  AgentReportContext,
  AgentReportReceipt,
  FrozenAgentReport,
} from "./report.types.js";

/** 报告持久化端口。 */
export interface AgentReportRepository {
  /** 加载冻结量表、全部完成评分和研究数量。 */
  loadContext(sessionId: string): Promise<AgentReportContext>;
  /** 原子提交旧表投影、完成事件和幂等账本。 */
  commitReport(report: FrozenAgentReport): Promise<AgentReportReceipt>;
}

/** Graph finalize_report 依赖的最小端口。 */
export interface AgentReportFinalizer {
  /** 生成并提交最终报告。 */ finalize(sessionId: string): Promise<AgentReportReceipt>;
}

/**
 * 从冻结逐题评分构造雷达图兼容维度汇总。
 *
 * @param context - 冻结量表和全部逐题评分。
 * @returns 每维平均、权重总分和强弱项。
 */
export function aggregateFrozenScores(
  context: AgentReportContext,
): AgentDimensionSummary {
  if (context.questions.length !== context.questionCount) {
    throw new Error("Final report requires every frozen question evaluation");
  }
  const dimensions: AgentDimensionSummary["dimensions"] = {};
  for (const rubric of context.rubric) {
    const scores = context.questions
      .map((question) => question.dimensions[rubric.key])
      .filter((dimension) => dimension?.status === "scored")
      .map((dimension) => dimension.score)
      .filter((score): score is number => Number.isInteger(score));
    if (scores.length === 0) continue;
    dimensions[rubric.key] = {
      score: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
      count: scores.length,
      weight: rubric.weight,
      evidenceCoverageCount: context.questions.filter((question) =>
        (question.dimensions[rubric.key]?.evidenceIds.length ?? 0) > 0,
      ).length,
    };
  }
  const values = Object.entries(dimensions);
  const totalWeight = values.reduce((sum, [, value]) => sum + value.weight, 0);
  const overallScore = totalWeight > 0
    ? Math.round(values.reduce((sum, [, value]) => sum + value.score * value.weight, 0) / totalWeight)
    : 0;
  const sorted = [...values].sort((left, right) => right[1].score - left[1].score);
  const labels = new Map(context.rubric.map((dimension) => [dimension.key, dimension.label]));
  return {
    dimensions,
    overallScore,
    strengths: sorted.slice(0, 3).filter(([, value]) => value.score >= 70).map(([key, value]) => `${labels.get(key) ?? key}(${value.score}分)`),
    weaknesses: sorted.slice(-3).filter(([, value]) => value.score < 70).map(([key, value]) => `${labels.get(key) ?? key}(${value.score}分)`),
  };
}

/** 只读冻结评分的报告服务。 */
export class DefaultAgentReportService implements AgentReportFinalizer {
  /** @param repository - 冻结读取和原子报告提交端口。 */
  constructor(private readonly repository: AgentReportRepository) {}

  /** @inheritdoc */
  async finalize(sessionId: string): Promise<AgentReportReceipt> {
    const context = await this.repository.loadContext(sessionId);
    const dimensionSummary = aggregateFrozenScores(context);
    const strengths = dimensionSummary.strengths.join("、") || "尚无充分优势证据";
    const weaknesses = dimensionSummary.weaknesses.join("、") || "暂无明显短板";
    return this.repository.commitReport({
      sessionId,
      completedAt: new Date().toISOString(),
      overallScore: dimensionSummary.overallScore,
      overallFeedback: `本场面试的证据化综合得分为 ${dimensionSummary.overallScore} 分。优势：${strengths}；建议重点改进：${weaknesses}。`,
      dimensionSummary,
      questionCount: context.questions.length,
      researchSourceCount: context.researchSourceCount,
    });
  }
}
