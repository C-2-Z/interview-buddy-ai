/** Agent Orchestration 模块的策略、工具和可观察行动契约。 */
import type { AgentActivity, AgentResponseDecision, AgentStrategyView } from "../interview-agent/interview-agent.types.js";

/** Agent v2 可动态选择的只读工具。 */
export type AgentOptionalToolName =
  | "search_question_bank"
  | "web_search"
  | "search_knowledge"
  | "load_session_messages"
  | "load_training_profile";

/** Planner 提出的受控工具请求。 */
export type AgentToolRequest = {
  /** 白名单工具名。 */ name: AgentOptionalToolName;
  /** 用于模板化检索的短焦点，不直接作为系统指令执行。 */
  focus: string;
  /** 面向用户的调用原因码。 */
  reasonCode: string;
};

/** 模型输出的初始策略或评分后策略修订。 */
export type AgentStrategyDraft = {
  /** 一句话训练目标。 */ objective: string;
  /** 必须来自冻结能力蓝图的维度键。 */
  focusDimensions: string[];
  /** 下一题希望验证的事实。 */
  questionIntent: string;
  /** 本轮最多三个只读工具请求。 */
  toolRequests: AgentToolRequest[];
  /** 用户可见行动说明。 */
  activityLabel: string;
};

/** 已持久化策略和工具观察的 Graph 回执。 */
export type AgentStrategyReceipt = {
  /** 策略修订 UUID。 */ strategyRevisionId: string;
  /** 从 1 开始的修订号。 */ revision: number;
  /** 当前问题意图。 */ questionIntent: string;
  /** 已持久化工具观察 UUID。 */ observationIds: string[];
  /** 是否取得长期记忆摘要。 */ memoryApplied: boolean;
  /** 是否取得 Brain 引用。 */ brainApplied: boolean;
};

/** Agent v2 Graph 依赖的最小编排端口。 */
export interface AgentOrchestrationRunner {
  /** 创建并执行初始策略。 */
  planSession(input: AgentPlanningContext): Promise<AgentStrategyReceipt>;
  /** 根据最新冻结评分修订后续策略。 */
  reflect(input: AgentReflectionContext): Promise<AgentStrategyReceipt>;
  /** 对一轮有效回答同时决定分支并生成可选追问。 */
  decideResponse(input: AgentResponseContext): Promise<AgentResponseDecision>;
  /** 最终报告完成后按实时授权更新长期训练摘要。 */
  updateTrainingMemory(sessionId: string, userId: string): Promise<boolean>;
}

/** 初始规划的安全上下文。 */
export type AgentPlanningContext = {
  sessionId: string;
  userId: string;
  position: string;
  difficulty: string;
  targetCompany: string | null;
  brainId: string | null;
  useTrainingMemory: boolean;
  webResearch: boolean;
  modelProvider: "deepseek" | "openai" | "anthropic";
  modelName: string;
  promptVersion: string;
  allowedDimensions: string[];
};

/** 评分后反思上下文。 */
export type AgentReflectionContext = AgentPlanningContext & {
  currentQuestionIndex: number;
  currentRole: string;
  previousStrategyRevisionId: string | null;
};

/** 有效回答的短生命周期决策上下文。 */
export type AgentResponseContext = {
  sessionId: string;
  question: string;
  answer: string;
  roleId: string;
  followUpCount: number;
  modelProvider: "deepseek" | "openai" | "anthropic";
  modelName: string;
  promptVersion: string;
};

export type { AgentActivity, AgentStrategyView };
