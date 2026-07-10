import type { DimensionSummary } from "@/features/interview-session/types";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

const LABEL_MAP: Record<string, string> = {
  COMMUNICATION: "沟通",
  LOGICAL_THINKING: "逻辑",
  PROBLEM_SOLVING: "解题",
  DS_ALGO: "算法",
  ML_BASICS: "ML基础",
  DL_NLP_CV: "深度学习",
  ENGINEERING: "模型工程",
  HTML_CSS: "HTML/CSS",
  JS_TS: "JS/TS",
  FW_ENGINE: "框架",
  PERF_SEC: "性能",
  JAVA: "Java",
  SPRING: "Spring",
  MYSQL: "MySQL",
  REDIS: "Redis",
  SYSTEM_DESIGN: "系统设计",
  PRODUCT_THINKING: "产品思维",
  DATA_DRIVEN: "数据驱动",
  STRATEGY: "战略",
  PROJECT_MGMT: "项目管理",
  PROJECT: "项目",
};

export function EvaluationRadar({
  summary,
  compact,
}: {
  summary: DimensionSummary | null | undefined;
  compact?: boolean;
}) {
  if (!summary || Object.keys(summary.dimensions).length === 0) {
    return null;
  }

  const chartData = Object.entries(summary.dimensions)
    .filter(([_, d]) => d.count > 0)
    .map(([key, d]) => ({
      dimension: LABEL_MAP[key] ?? key,
      score: d.score,
    }));

  if (chartData.length === 0) return null;

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      <div className={compact ? "h-48" : "h-64"}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="dimension" fontSize={compact ? 10 : 12} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="score" fill="hsl(var(--primary))" fillOpacity={0.3} stroke="hsl(var(--primary))" strokeWidth={1.5} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <h4 className="mb-1 font-medium text-emerald-700 dark:text-emerald-400">强项</h4>
          {summary.strengths.length > 0 ? (
            <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
              {summary.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          ) : (
            <p className="text-muted-foreground">暂无</p>
          )}
        </div>
        <div>
          <h4 className="mb-1 font-medium text-amber-700 dark:text-amber-400">待提升</h4>
          {summary.weaknesses.length > 0 ? (
            <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
              {summary.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          ) : (
            <p className="text-muted-foreground">暂无</p>
          )}
        </div>
      </div>
    </div>
  );
}
