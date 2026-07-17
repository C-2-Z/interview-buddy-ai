/** Interview Agent Phase 3 后续题目选择与提交的运行时类型。 */
import type {
  FrozenAgentConfig,
  RoleId,
  RoleStage,
} from "../interview-agent.types.js";
import type {
  AgentQuestionSelectionTier,
  PreparedInterviewPlan,
} from "../tools/preparation.types.js";

/** 数据库中已经使用的题目投影。 */
export type RuntimeQuestionHistory = {
  /** 业务题目 UUID。 */
  id: string;
  /** 题目正文，用于规范文本去重。 */
  question: string;
  /** 全场零基索引。 */
  orderIndex: number;
  /** 主能力维度。 */
  dimensionKey: string;
  /** 题库来源 UUID；模型题为 null。 */
  bankQuestionId: string | null;
};

/** 动态选题所需的冻结上下文。 */
export type RuntimeQuestionContext = {
  /** 创建时冻结配置。 */
  config: FrozenAgentConfig;
  /** Phase 2 冻结计划。 */
  plan: PreparedInterviewPlan;
  /** 已持久化题目。 */
  questions: RuntimeQuestionHistory[];
};

/** 原子提交后续题目的输入。 */
export type CommitRuntimeQuestionInput = {
  /** Agent 会话 UUID。 */
  sessionId: string;
  /** 新业务题目 UUID。 */
  id: string;
  /** 全场零基索引。 */
  orderIndex: number;
  /** 题目正文。 */
  question: string;
  /** 冻结角色。 */
  roleId: RoleId;
  /** 冻结主维度。 */
  dimensionKey: string;
  /** 题库优先或模型兜底。 */
  source: "bank" | "model";
  /** 题库 UUID；模型题为 null。 */
  bankQuestionId: string | null;
  /** 跨题目变体稳定的题目家族键。 */
  questionFamilyKey: string;
  /** 题库命中或模型兜底层级。 */
  selectionTier: AgentQuestionSelectionTier;
  /** 确定性题库评分；模型兜底为 null。 */
  selectionScore: number | null;
  /** 稳定的选择原因代码。 */
  selectionReasonCode: string;
};

/** 后续题目提交结果。 */
export type RuntimeQuestionReceipt = {
  /** 首次插入时为 true。 */
  committed: boolean;
  /** 节点重放时为 true。 */
  duplicate: boolean;
  /** `question:<index>` 幂等键。 */
  operationKey: string;
  /** 业务题目 UUID。 */
  questionId: string;
  /** 全场索引。 */
  orderIndex: number;
  /** 当前角色。 */
  roleId: RoleId;
  /** 当前主维度。 */
  dimensionKey: string;
  /** 提交的最后事件序号。 */
  eventSequence: number;
};

/** Graph select_question 节点需要的输入。 */
export type SelectRuntimeQuestionInput = {
  /** Agent 会话 UUID。 */
  sessionId: string;
  /** 当前全场题号。 */
  questionIndex: number;
  /** advance_stage 计算出的角色。 */
  roleId: RoleId;
  /** v2 Reflection 给出的下一题战术意图；v1 缺省。 */
  questionIntent?: string | null;
  /** Planner/Reflection 冻结的主维度。 */ primaryDimension?: string | null;
  /** 本题策略主题键。 */ topicKeys?: string[];
  /** 本题冻结证据目标。 */ evidenceGoalKeys?: string[];
  /** Planner/Reflection 已持久化的工具观察引用；Graph 只保存这些 ID。 */ observationIds?: string[];
};

/** Graph select_question 节点的结果。 */
export type SelectedRuntimeQuestion = {
  /** 新业务题目 UUID。 */
  questionId: string;
  /** 当前角色。 */
  roleId: RoleId;
  /** 当前能力维度。 */
  dimensionKey: string;
};

/** 返回某题索引所在的角色阶段。 */
export function stageForQuestion(
  stages: readonly RoleStage[],
  questionIndex: number,
): RoleStage | null {
  return stages.find(
    (stage) =>
      questionIndex >= stage.startQuestionIndex &&
      questionIndex <= stage.endQuestionIndex,
  ) ?? null;
}
