/** Agent Memory 模块的授权状态与脱敏长期训练摘要契约。 */

/** 不包含回答原文的跨场训练摘要。 */
export type AgentTrainingSummary = {
  /** 按冻结量表键记录的最近聚合分。 */
  dimensions: Record<string, { score: number; sampleCount: number }>;
  /** 多场重复出现的薄弱维度键。 */
  recurringWeaknesses: string[];
  /** 下一场优先训练的维度键。 */
  suggestedFocus: string[];
  /** 参与聚合的有效报告数量。 */
  completedSessionCount: number;
};

/** 当前用户的长期训练记忆状态。 */
export type AgentMemoryView = {
  /** 用户是否允许后续会话读取和更新摘要。 */
  enabled: boolean;
  /** 没有有效历史报告或已清除时为 null。 */
  summary: AgentTrainingSummary | null;
  /** 最近一次摘要更新时间。 */
  updatedAt: string | null;
};
