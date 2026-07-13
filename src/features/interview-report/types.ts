/** Interview report 前端类型：复用只读 Agent 工作台投影并派生能力摘要。 */
import type { AgentWorkspace } from "@/features/interview-agent/types";

/** 报告 API 返回的完整只读投影。 */
export type InterviewReport = AgentWorkspace;

/** 由逐题冻结评分聚合的能力维度。 */
export type InterviewReportDimension = Readonly<{
  /** rubric 维度键。 */ key: string;
  /** 该维度平均分。 */ score: number;
  /** 参与平均的题目数。 */ count: number;
}>;
