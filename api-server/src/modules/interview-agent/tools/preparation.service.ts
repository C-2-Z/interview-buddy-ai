/** Interview Agent Phase 2 Skill/简历/研究/蓝图/首题准备编排。 */
import type { AgentModelProvider } from "../providers/agent-model.provider.js";
import {
  formatUntrustedResearchForPrompt,
  type WebSearchProvider,
} from "../providers/web-search.provider.js";
import type {
  AgentMode,
  FrozenAgentConfig,
} from "../interview-agent.types.js";
import { buildRolePlan } from "../roles/personas.js";
import { getRolePersona } from "../roles/personas.js";
import { buildCapabilityBlueprint } from "./capability-blueprint.js";
import type { InterviewAgentTools } from "./interview-agent.tools.js";
import type {
  AgentQuestionCandidate,
  AgentResearchSource,
  AgentResumeSummary,
  CapabilityBlueprint,
  PreparedInterviewPlan,
} from "./preparation.types.js";
import type { AgentQuestionCriteria } from "../../agent-orchestration/agent-orchestration.types.js";
import { selectQuestionWithFallback } from "./question-selector.js";
import { conductPreInterviewResearch } from "./research.service.js";

/** 准备一场面试所需的冻结输入。 */
export type PrepareInterviewInput = {
  /** 业务会话 UUID。 */
  sessionId: string;
  /** 单面试官或固定阶段面板。 */
  mode: AgentMode;
  /** 创建时冻结且不含凭据的配置。 */
  config: FrozenAgentConfig;
};

/** 准备服务的可替换依赖。 */
export type InterviewPreparationDependencies = {
  /** 项目内 allowlist 只读工具。 */
  tools: InterviewAgentTools;
  /** Tavily 或显式禁用 Provider。 */
  webSearchProvider: WebSearchProvider;
  /** 题库无命中时使用的模型 Adapter。 */
  modelProvider: AgentModelProvider;
  /** 读取已清洗研究缓存的内部存储端口；它不会注册为模型工具。 */
  loadResearchSources(sessionId: string): Promise<AgentResearchSource[]>;
};

/**
 * 将模型输出投影为动态选题候选。
 *
 * @param output - 模型 Adapter 的结构化题目。
 * @param input - 冻结岗位配置。
 * @param dimensionKey - 当前题目主维度。
 * @returns 标记为 model 来源的候选题。
 */
function modelQuestionCandidate(
  output: Awaited<ReturnType<AgentModelProvider["generateQuestion"]>>,
  input: FrozenAgentConfig,
  dimensionKey: string,
  roleId: "general" | "technical" | "manager" | "hr",
  criteria: AgentQuestionCriteria,
): AgentQuestionCandidate {
  return {
    id: output.questionId,
    question: output.content,
    position: input.position,
    difficulty: input.difficulty,
    type: dimensionKey,
    tags: [dimensionKey],
    roleIds: [roleId],
    dimensionKeys: [dimensionKey],
    topicKeys: criteria.topicKeys,
    evidenceGoalKeys: criteria.evidenceGoalKeys,
    source: "model",
  };
}

/** 首题选择前已冻结的安全上下文。 */
export type PreparedInterviewContext = {
  /** 代码冻结的角色与能力蓝图。 */
  rolePlan: ReturnType<typeof buildRolePlan>;
  /** 代码冻结的能力分配。 */
  blueprint: CapabilityBlueprint & {
    questionRoles: Array<"general" | "technical" | "manager" | "hr">;
    questionDimensions: string[];
  };
  /** 只包含有限字段的简历摘要。 */ resumeSummary: AgentResumeSummary | null;
  /** 已清洗且限长的研究引用。 */ research: Awaited<ReturnType<typeof conductPreInterviewResearch>>;
  /** 当前岗位和难度的题库候选。 */ candidates: AgentQuestionCandidate[];
};

/** Interview Agent Phase 2 的开场准备服务。 */
export class InterviewPreparationService {
  /**
   * 创建可注入工具和 Provider 的准备服务。
   *
   * @param dependencies - 只读工具、搜索 Provider 和模型 Adapter。
   */
  constructor(
    private readonly dependencies: InterviewPreparationDependencies,
  ) {}

  /**
   * 先冻结能力蓝图并加载有限上下文，不在此阶段选择或生成首题。
   *
   * @param input - 会话标识、模式和冻结配置。
   * @param signal - 可选取消信号。
   * @returns Planner 可安全使用的准备上下文。
   */
  async prepareContext(
    input: PrepareInterviewInput,
    signal?: AbortSignal,
  ): Promise<PreparedInterviewContext> {
    const [skill, resumeSummary, cachedSources] = await Promise.all([
      this.dependencies.tools.loadSkill(input.config.skillId),
      this.dependencies.tools.loadResumeSummary(input.config.resumeId),
      this.dependencies.loadResearchSources(input.sessionId),
    ]);
    const rolePlan = buildRolePlan(input.mode, input.config.questionCount);
    const blueprint = buildCapabilityBlueprint({
      mode: input.mode,
      questionCount: input.config.questionCount,
      rolePlan,
      skill,
    });
    const [research, candidates] = await Promise.all([
      conductPreInterviewResearch(this.dependencies.webSearchProvider, {
        // Agent 3 的实时联网只能由 Planner 授权；准备阶段仅复用已经清洗的缓存引用。
        enabled: false,
        position: input.config.position,
        targetCompany: input.config.targetCompany,
        cachedSources,
      }, signal),
      this.dependencies.tools.searchQuestionBank({
        position: input.config.position,
        difficulty: input.config.difficulty,
        limit: 50,
      }),
    ]);
    return { rolePlan, blueprint, resumeSummary, research, candidates };
  }

  /**
   * 按 Planner 已提交标准选择首题；不满足角色、难度、主维度和策略条件时使用模型生成。
   *
   * @param input - 冻结会话配置。
   * @param context - 已冻结且可复用的准备上下文。
   * @param criteria - Planner 的结构化选题标准。
   * @param signal - 可选取消信号。
   * @returns 包含首题和每题适用维度/证据目标的 plan-v3。
   */
  async selectFirstQuestion(
    input: PrepareInterviewInput,
    context: PreparedInterviewContext,
    criteria: AgentQuestionCriteria,
    toolResultContexts: string[] = [],
    signal?: AbortSignal,
  ): Promise<PreparedInterviewPlan> {
    const firstRole = context.blueprint.questionRoles[0];
    const primaryDimension = criteria.primaryDimension;
    const firstQuestion = await selectQuestionWithFallback(context.candidates, {
      position: input.config.position,
      difficulty: input.config.difficulty,
      roleId: firstRole,
      dimensionKey: primaryDimension,
      desiredTopicKeys: criteria.topicKeys,
      evidenceGoalKeys: criteria.evidenceGoalKeys,
      excludedQuestionIds: new Set(),
      excludedQuestionTexts: new Set(),
      excludedTopicKeys: new Set(),
    }, async () => modelQuestionCandidate(
      await this.dependencies.modelProvider.generateQuestion({
        sessionId: input.sessionId,
        questionIndex: 0,
        roleId: firstRole,
        persona: getRolePersona(firstRole),
        position: input.config.position,
        difficulty: input.config.difficulty,
        promptVersion: input.config.promptVersion,
        modelProvider: input.config.modelProvider,
        modelName: input.config.modelName,
        dimensionKey: primaryDimension,
        strategyIntent: criteria.questionIntent,
        trustedContext: {
          jobDescription: input.config.jobDescription,
          resumeSummary: context.resumeSummary,
        },
        untrustedResearchContext: formatUntrustedResearchForPrompt(context.research.sources),
        toolResultContext: toolResultContexts.join("\n").slice(0, 12_000),
      }, signal),
      input.config,
      primaryDimension,
      firstRole,
      criteria,
    ));
    const questionDimensions = [...context.blueprint.questionDimensions];
    questionDimensions[0] = primaryDimension;
    const questionApplicableDimensions = questionDimensions.map((dimension, index) => [
      dimension,
      "COMMUNICATION",
      ...(["general", "technical", "manager"].includes(context.blueprint.questionRoles[index])
        ? ["LOGICAL_THINKING"]
        : []),
    ].filter((value, index, values) => values.indexOf(value) === index));
    return {
      version: "plan-v3",
      rolePlan: context.rolePlan,
      capabilityBlueprint: context.blueprint,
      questionRoles: context.blueprint.questionRoles,
      questionDimensions,
      questionApplicableDimensions,
      questionEvidenceGoals: questionDimensions.map((_, index) => index === 0
        ? criteria.evidenceGoalKeys
        : ["situation", "action", "result"]),
      firstQuestion,
      researchStatus: context.research.status,
      researchSources: context.research.sources,
    };
  }

  /**
   * 加载 Skill/简历/缓存，执行可降级研究，冻结蓝图并选择首题。
   *
   * 题量、角色和维度全部由代码决定；网页内容只作为不可执行数据传给模型，不能改变
   * `rolePlan`、`questionCount` 或结束条件。题库存在合法候选时不会调用模型。
   *
   * @param input - 会话标识、模式和冻结配置。
   * @param signal - Worker 或请求取消信号。
   * @returns 可持久化的 plan-v3。
   */
  async prepare(
    input: PrepareInterviewInput,
    signal?: AbortSignal,
  ): Promise<PreparedInterviewPlan> {
    const context = await this.prepareContext(input, signal);
    const primaryDimension = context.blueprint.questionDimensions[0];
    return this.selectFirstQuestion(input, context, {
      primaryDimension,
      topicKeys: [input.config.position],
      evidenceGoalKeys: ["situation", "action", "result"],
      questionIntent: "通过具体经历、行动和结果验证候选人的真实能力",
    }, [], signal);
  }
}
