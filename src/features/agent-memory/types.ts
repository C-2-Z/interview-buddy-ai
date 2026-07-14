/** Agent Memory 前端契约：仅包含用户授权和聚合训练摘要。 */

/** 不含回答原文的长期训练摘要。 */
export type AgentTrainingSummary = Readonly<{
  dimensions: Record<string, { score: number; sampleCount: number }>;
  recurringWeaknesses: string[];
  suggestedFocus: string[];
  completedSessionCount: number;
}>;

/** 当前用户的训练记忆授权状态。 */
export type AgentMemoryView = Readonly<{
  enabled: boolean;
  summary: AgentTrainingSummary | null;
  updatedAt: string | null;
}>;
