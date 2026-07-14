/** Agent Memory Service：执行授权、读取、清除和报告聚合业务规则。 */
import type { AgentMemoryRepository } from "./agent-memory.repository.js";
import type { AgentMemoryView, AgentTrainingSummary } from "./agent-memory.types.js";

/** 最终报告中用于长期记忆聚合的最小输入。 */
export type TrainingReportObservation = {
  /** 每个维度本场聚合分。 */
  dimensions: Record<string, { score: number }>;
};

/** 长期训练记忆业务服务。 */
export class AgentMemoryService {
  /** @param repository - 用户作用域持久化端口。 */
  constructor(private readonly repository: AgentMemoryRepository) {}

  /** 读取授权和脱敏摘要。 */
  get(userId: string): Promise<AgentMemoryView> {
    return this.repository.get(userId);
  }

  /** 更新全局授权，不隐式删除既有摘要。 */
  setEnabled(userId: string, enabled: boolean): Promise<AgentMemoryView> {
    return this.repository.setEnabled(userId, enabled);
  }

  /** 清除摘要且不删除原始面试报告。 */
  clear(userId: string): Promise<AgentMemoryView> {
    return this.repository.clear(userId);
  }

  /**
   * 将一份有效报告合并为只含量表聚合值的长期摘要。
   *
   * @param userId - 当前鉴权用户。
   * @param report - 已冻结报告的维度汇总。
   * @returns 是否在提交时仍获授权并完成更新。
   */
  async mergeReport(userId: string, report: TrainingReportObservation): Promise<boolean> {
    const current = await this.repository.get(userId);
    if (!current.enabled || Object.keys(report.dimensions).length === 0) return false;
    const dimensions: AgentTrainingSummary["dimensions"] = { ...(current.summary?.dimensions ?? {}) };
    for (const [key, value] of Object.entries(report.dimensions)) {
      const previous = dimensions[key];
      const sampleCount = (previous?.sampleCount ?? 0) + 1;
      const score = Math.round(((previous?.score ?? 0) * (sampleCount - 1) + value.score) / sampleCount);
      dimensions[key] = { score, sampleCount };
    }
    const ranked = Object.entries(dimensions).sort((left, right) => left[1].score - right[1].score);
    await this.repository.saveSummary(userId, {
      dimensions,
      recurringWeaknesses: ranked.filter(([, value]) => value.sampleCount >= 2 && value.score < 70).slice(0, 5).map(([key]) => key),
      suggestedFocus: ranked.slice(0, 3).map(([key]) => key),
      completedSessionCount: (current.summary?.completedSessionCount ?? 0) + 1,
    });
    return true;
  }
}
