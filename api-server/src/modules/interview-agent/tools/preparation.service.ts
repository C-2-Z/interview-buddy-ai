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
  PreparedInterviewPlan,
} from "./preparation.types.js";
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
): AgentQuestionCandidate {
  return {
    id: output.questionId,
    question: output.content,
    position: input.position,
    difficulty: input.difficulty,
    type: dimensionKey,
    tags: [dimensionKey],
    source: "model",
  };
}

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
   * 加载 Skill/简历/缓存，执行可降级研究，冻结蓝图并选择首题。
   *
   * 题量、角色和维度全部由代码决定；网页内容只作为不可执行数据传给模型，不能改变
   * `rolePlan`、`questionCount` 或结束条件。题库存在合法候选时不会调用模型。
   *
   * @param input - 会话标识、模式和冻结配置。
   * @param signal - Worker 或请求取消信号。
   * @returns 可持久化的 plan-v1。
   */
  async prepare(
    input: PrepareInterviewInput,
    signal?: AbortSignal,
  ): Promise<PreparedInterviewPlan> {
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
    const research = await conductPreInterviewResearch(
      this.dependencies.webSearchProvider,
      {
        enabled: input.config.webResearch,
        position: input.config.position,
        targetCompany: input.config.targetCompany,
        cachedSources,
      },
      signal,
    );
    const candidates = await this.dependencies.tools.searchQuestionBank({
      position: input.config.position,
      difficulty: input.config.difficulty,
      limit: 50,
    });
    const firstRole = blueprint.questionRoles[0];
    const firstDimension = blueprint.questionDimensions[0];
    const firstQuestion = await selectQuestionWithFallback(
      candidates,
      {
        position: input.config.position,
        difficulty: input.config.difficulty,
        roleId: firstRole,
        dimensionKey: firstDimension,
        excludedQuestionIds: new Set(),
        excludedQuestionTexts: new Set(),
        excludedTopicKeys: new Set(),
      },
      async () =>
        modelQuestionCandidate(
          await this.dependencies.modelProvider.generateQuestion(
            {
              sessionId: input.sessionId,
              questionIndex: 0,
              roleId: firstRole,
              persona: getRolePersona(firstRole),
              position: input.config.position,
              difficulty: input.config.difficulty,
              promptVersion: input.config.promptVersion,
              dimensionKey: firstDimension,
              trustedContext: {
                jobDescription: input.config.jobDescription,
                resumeSummary,
              },
              untrustedResearchContext: formatUntrustedResearchForPrompt(
                research.sources,
              ),
            },
            signal,
          ),
          input.config,
          firstDimension,
        ),
    );

    return {
      version: "plan-v1",
      rolePlan,
      capabilityBlueprint: {
        version: blueprint.version,
        questionCount: blueprint.questionCount,
        dimensions: blueprint.dimensions,
      },
      questionRoles: blueprint.questionRoles,
      questionDimensions: blueprint.questionDimensions,
      firstQuestion,
      researchStatus: research.status,
      researchSources: research.sources,
    };
  }
}
