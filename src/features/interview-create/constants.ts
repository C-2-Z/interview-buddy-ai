export const TYPE_PROFILES: Record<string, Record<string, number>> = {
  tech: { 技术题: 60, 行为题: 15, 场景题: 15, 系统设计: 10 },
  behavior: { 技术题: 20, 行为题: 50, 场景题: 20, 系统设计: 10 },
  scenario: { 技术题: 20, 行为题: 15, 场景题: 50, 系统设计: 15 },
  balanced: { 技术题: 35, 行为题: 25, 场景题: 25, 系统设计: 15 },
};

export const QUESTION_COUNTS = [3, 5, 7, 10] as const;

