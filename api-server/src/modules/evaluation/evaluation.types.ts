// 单个维度评分
export interface DimensionScoreItem {
  score: number;
  comment: string;
}

// 一道题的多维度评分（key = 维度关键字）
export type DimensionScores = Record<string, DimensionScoreItem>;

// 维度定义（供 prompt 使用）
export interface DimensionDef {
  key: string;
  label: string;
  description: string;
  weight: number;
}

// 聚合后的维度汇总
export interface AggregatedDimension {
  score: number;
  count: number;
  weight: number;
}

// 整场面试的维度汇总
export interface DimensionSummary {
  dimensions: Record<string, AggregatedDimension>;
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
}
