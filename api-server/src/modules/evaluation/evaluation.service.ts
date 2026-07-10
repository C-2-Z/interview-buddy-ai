import type { SkillDef } from "../skills/skill.types.js";
import type {
  DimensionDef,
  DimensionScores,
  AggregatedDimension,
  DimensionSummary,
} from "./evaluation.types.js";

export const UNIVERSAL_DIMENSIONS: DimensionDef[] = [
  { key: "COMMUNICATION", label: "沟通表达", description: "表达清晰度、术语准确、回答结构完整", weight: 2 },
  { key: "LOGICAL_THINKING", label: "逻辑思维", description: "分析层次性、推理严谨、因果关系", weight: 2 },
  { key: "PROBLEM_SOLVING", label: "问题解决", description: "解题策略、方案对比、应变能力", weight: 2 },
];

const PRIORITY_WEIGHT: Record<string, number> = {
  CORE: 3,
  NORMAL: 2,
  ALWAYS_ONE: 1,
};

export function getDimensionDefs(skill: SkillDef | null): DimensionDef[] {
  const skillDefs: DimensionDef[] = (skill?.categories ?? [])
    .filter((c) => c.key !== "PROJECT")
    .map((c) => ({
      key: c.key,
      label: c.label,
      description: c.label,
      weight: PRIORITY_WEIGHT[c.priority] ?? 2,
    }));
  return [...UNIVERSAL_DIMENSIONS, ...skillDefs];
}

export function buildDimensionPromptSection(dimensions: DimensionDef[]): string {
  const lines = dimensions.map(
    (d) => "  - " + d.key + "（" + d.label + "）：" + d.description + "（权重" + d.weight + "）",
  );
  return "\n评分维度（逐项评分）:\n" + lines.join("\n");
}

export function aggregateDimensions(
  questions: { dimension_scores: DimensionScores | null; score: number }[],
  dimensionDefs: DimensionDef[],
): DimensionSummary {
  const raw: Record<string, { scores: number[]; weight: number }> = {};
  for (const def of dimensionDefs) {
    raw[def.key] = { scores: [], weight: def.weight };
  }
  for (const q of questions) {
    if (!q.dimension_scores) continue;
    for (const [key, item] of Object.entries(q.dimension_scores)) {
      if (!raw[key]) raw[key] = { scores: [], weight: 2 };
      raw[key].scores.push(item.score);
    }
  }
  const dimensions: Record<string, AggregatedDimension> = {};
  for (const [key, data] of Object.entries(raw)) {
    if (data.scores.length === 0) continue;
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    dimensions[key] = { score: Math.round(avg), count: data.scores.length, weight: data.weight };
  }
  let totalWeight = 0, weightedSum = 0;
  for (const d of Object.values(dimensions)) {
    weightedSum += d.score * d.weight;
    totalWeight += d.weight;
  }
  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  return { dimensions, overallScore, ...identifyWeaknesses(dimensions) };
}

function identifyWeaknesses(
  dimensions: Record<string, AggregatedDimension>,
): { strengths: string[]; weaknesses: string[] } {
  const sorted = Object.entries(dimensions)
    .filter(([, d]) => d.score > 0)
    .sort(([, a], [, b]) => b.score - a.score);
  const labelMap: Record<string, string> = {
    COMMUNICATION: "沟通表达", LOGICAL_THINKING: "逻辑思维", PROBLEM_SOLVING: "问题解决",
    DS_ALGO: "数据结构与算法", ML_BASICS: "机器学习基础", DL_NLP_CV: "深度学习与模型",
    ENGINEERING: "模型工程与部署", HTML_CSS: "HTML / CSS", JS_TS: "JavaScript / TypeScript",
    FW_ENGINE: "框架与工程化", PERF_SEC: "性能与安全", JAVA: "Java 基础",
    SPRING: "Spring 框架", MYSQL: "MySQL 数据库", REDIS: "Redis 缓存",
    SYSTEM_DESIGN: "系统设计", PRODUCT_THINKING: "产品思维与设计",
    DATA_DRIVEN: "数据驱动", STRATEGY: "产品战略", PROJECT_MGMT: "项目管理", PROJECT: "项目经历",
  };
  const fmt = (k: string, s: number) => (labelMap[k] || k) + "(" + s + "分)";
  const strengths = sorted.slice(0, 3).filter(([, d]) => d.score >= 70).map(([k, d]) => fmt(k, d.score));
  const weaknesses = sorted.slice(-3).filter(([, d]) => d.score < 70).map(([k, d]) => fmt(k, d.score));
  return { strengths, weaknesses };
}
