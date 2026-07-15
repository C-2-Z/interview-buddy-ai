/** Agent Orchestration 模块的策略、工具和可观察行动契约。 */
import type { AgentActivity, AgentResponseDecision, AgentStrategyView } from "../interview-agent/interview-agent.types.js";

/** Agent 3 可动态选择的只读工具。 */
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
  /** 下一题必须满足的结构化选题标准。 */
  questionCriteria: AgentQuestionCriteria;
  /** 本轮最多三个只读工具请求。 */
  toolRequests: AgentToolRequest[];
  /** 用户可见行动说明。 */
  activityLabel: string;
};

/** Planner 冻结给选题器的结构化标准。 */
export type AgentQuestionCriteria = {
  /** 题目必须命中的主能力维度。 */ primaryDimension: string;
  /** 用于题库相关性排序的主题键。 */ topicKeys: string[];
  /** 本题需要覆盖的事实证据目标。 */ evidenceGoalKeys: string[];
  /** 面试官希望通过本题验证的具体意图。 */ questionIntent: string;
};

/** 已持久化策略和工具观察的 Graph 回执。 */
export type AgentStrategyReceipt = {
  /** 策略修订 UUID。 */ strategyRevisionId: string;
  /** 从 1 开始的修订号。 */ revision: number;
  /** 当前问题意图。 */ questionIntent: string;
  /** 已提交的结构化选题标准。 */ questionCriteria: AgentQuestionCriteria;
  /** 已持久化工具观察 UUID。 */ observationIds: string[];
  /** 是否取得长期记忆摘要。 */ memoryApplied: boolean;
  /** 是否取得 Brain 引用。 */ brainApplied: boolean;
};

/** Agent 3 Graph 依赖的最小编排端口。 */
export interface AgentOrchestrationRunner {
  /** 创建并执行初始策略。 */
  planSession(input: AgentPlanningContext): Promise<AgentStrategyReceipt>;
  /** 首题提交重试时读取已提交策略；不存在时返回 null。 */
  resumePreparedStrategy?(sessionId: string): Promise<AgentStrategyReceipt | null>;
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
  /** 仅在 Planner 调用期间提供的岗位正文，不写入 checkpoint。 */ jobDescription?: string | null;
  /** 仅在 Planner 调用期间提供的有限简历摘要。 */ resumeSummary?: unknown;
  /** 已清洗研究来源的限长引用上下文。 */ researchContext?: Array<{ title: string; snippet: string }>;
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
  /** 当前题按时间顺序加载的完整候选人/面试官消息序列。 */
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
  /** 本题冻结的证据目标，用于判断继续追问还是进入评分。 */ evidenceGoals: string[];
  roleId: string;
  followUpCount: number;
  modelProvider: "deepseek" | "openai" | "anthropic";
  modelName: string;
  promptVersion: string;
};

export type { AgentActivity, AgentStrategyView };
