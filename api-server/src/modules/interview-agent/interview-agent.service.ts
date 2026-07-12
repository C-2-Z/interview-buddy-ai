/** Interview Agent Phase 1 会话创建、Graph 恢复与幂等业务流程。 */
import { randomUUID } from "node:crypto";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { resolveProviderForCreation } from "../model-providers/model-provider.service.js";
import { createModuleLogger } from "../voice/voice-logger.js";
import { getAgentRuntimeConfig, type AgentRuntimeConfig } from "./interview-agent.config.js";
import {
  FrozenAgentConfigSchema,
  InterviewAgentStateSchema,
  type AgentInput,
  type CreateAgentSessionInput,
} from "./interview-agent.schemas.js";
import {
  createInterviewAgentRepository,
  InterviewAgentRepositoryError,
  type AgentEventDraft,
  type AgentSessionProjection,
  type InterviewAgentRepository,
} from "./interview-agent.repository.js";
import type {
  AgentInputResponse,
  AgentInterruptResponse,
  AgentRetryResponse,
  AgentSessionView,
  AgentSnapshot,
  CreateAgentSessionResponse,
  FrozenAgentConfig,
  InterviewAgentState,
} from "./interview-agent.types.js";
import {
  compileInterviewAgentGraph,
  createAgentGraphConfig,
  createAgentResumeCommand,
  createAgentSnapshot,
  createInitialAgentState,
} from "./graph/interview-agent.graph.js";
import { createPostgresCheckpointer } from "./graph/checkpointer.js";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { buildRolePlan } from "./roles/personas.js";
import { createDefaultInterviewAgentTools } from "./tools/default-interview-agent.tools.js";
import {
  createInterviewPreparationRepository,
  type PreparationCommitRepository,
} from "./tools/preparation.repository.js";
import { InterviewPreparationService } from "./tools/preparation.service.js";
import { createWebSearchProviderFromEnv } from "./providers/web-search.provider.js";
import type { AgentInterviewerModelProvider } from "./providers/agent-model.provider.js";
import { createProductionAgentModelProvider } from "./providers/production-agent-model.provider.js";
import {
  createAgentInputRepository,
  AgentInputRepositoryError,
  type AgentInputRepository,
} from "./input/input.repository.js";
import { createQuestionRuntimeRepository } from "./runtime/question-runtime.repository.js";
import {
  DefaultQuestionRuntimeService,
  type QuestionRuntimeService,
} from "./runtime/question-runtime.service.js";
import { createAgentEvaluationRepository } from "./evaluation/evaluation.repository.js";
import { createAgentEvaluationModelProvider } from "./evaluation/evaluation-model.provider.js";
import { createAgentRunAuditor } from "./audit/agent-run.repository.js";
import { QuestionEvaluationService } from "./evaluation/evaluation.service.js";
import { createAgentReportRepository } from "./report/report.repository.js";
import { DefaultAgentReportService } from "./report/report.service.js";

const logger = createModuleLogger("interview-agent");
const PREPARE_OPERATION_KEY = "prepare:agent-v1";
const PREPARE_NODE_NAME = "prepare_interview";
const INPUT_NODE_NAME = "wait_for_input";

/** 已编译 Interview Agent Graph 的结构类型。 */
export type InterviewAgentGraph = ReturnType<
  typeof compileInterviewAgentGraph
>;

/** Service 创建期间解析出的无凭据模型选择。 */
export type ResolvedAgentModel = {
  /** 冻结到配置中的 Provider 名称。 */
  name: "deepseek" | "openai" | "anthropic";
  /** 冻结到配置中的模型名称。 */
  model: string;
};

/** Service 可替换依赖，用于真实 Supabase/Postgres 与纯内存测试共用流程。 */
export type InterviewAgentServiceDependencies = {
  /** 当前用户作用域的业务 Repository。 */
  repository: InterviewAgentRepository;
  /** 已验证 JWT 的用户 UUID。 */
  userId: string;
  /** 延迟取得已编译 Graph，关闭功能时不会读取 DATABASE_URL。 */
  getGraph: () => InterviewAgentGraph;
  /** 非敏感运行配置。 */
  runtimeConfig: AgentRuntimeConfig;
  /** 解析用户设置中的 Provider，但返回值不携带 API Key。 */
  resolveModel: (
    input: CreateAgentSessionInput,
  ) => Promise<ResolvedAgentModel>;
  /** Phase 2 Skill/简历/研究/能力蓝图编排；测试可省略以保留最小图验证。 */
  preparationService?: InterviewPreparationService;
  /** Phase 2 原子准备持久化；必须与 preparationService 同时提供。 */
  preparationRepository?: PreparationCommitRepository;
  /** Phase 3 在恢复 Graph 前原子保存回答正文；测试最小图可省略。 */
  inputRepository?: AgentInputRepository;
  /** true 表示 Graph finalize_report 已提交完整 session_completed 报告事件。 */
  reportFinalizedInGraph?: boolean;
};

/** Service 对 HTTP adapter 暴露的稳定错误码。 */
export type InterviewAgentServiceErrorCode =
  | "agent_interview_disabled"
  | "agent_session_not_found"
  | "agent_operation_in_progress"
  | "agent_invalid_phase"
  | "agent_graph_unavailable"
  | "agent_finish_not_available";

/** 不泄露 checkpoint、模型或数据库详情的 Service 错误。 */
export class InterviewAgentServiceError extends Error {
  /** 客户端可安全分支处理的稳定错误码。 */
  readonly code: InterviewAgentServiceErrorCode;
  /** HTTP adapter 建议返回的状态码。 */
  readonly statusCode: number;
  /** 客户端是否可以安全重试。 */
  readonly retryable: boolean;

  /**
   * 创建固定消息的业务错误。
   *
   * @param code - 稳定错误码。
   * @param message - 不含底层异常详情的消息。
   * @param statusCode - HTTP 状态码。
   * @param retryable - 是否适合重试。
   */
  constructor(
    code: InterviewAgentServiceErrorCode,
    message: string,
    statusCode: number,
    retryable: boolean,
  ) {
    super(message);
    this.name = "InterviewAgentServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/** 进程内只复用 PostgresSaver 连接池；Graph 按用户 Repository 轻量编译。 */
let defaultCheckpointer: BaseCheckpointSaver | undefined;

/**
 * 延迟创建生产 Graph；该路径不会调用 checkpointer.setup() 或执行 DDL。
 *
 * @returns 使用 PostgresSaver 和 Phase 1 Mock 节点的 compiled graph。
 */
function getDefaultInterviewAgentGraph(
  inputRepository: AgentInputRepository,
  questionRuntimeService: QuestionRuntimeService,
  interviewerModelProvider: AgentInterviewerModelProvider,
  evaluationService: QuestionEvaluationService,
  reportService: DefaultAgentReportService,
): InterviewAgentGraph {
  defaultCheckpointer ??= createPostgresCheckpointer();
  return compileInterviewAgentGraph({
    checkpointer: defaultCheckpointer,
    inputRepository,
    questionRuntimeService,
    interviewerModelProvider,
    evaluationService,
    reportService,
  });
}

/**
 * 从最新已提交快照事件提取客户端快照。
 *
 * @param repository - 当前用户作用域 Repository。
 * @param sessionId - Agent 会话 UUID。
 * @returns 与业务事件水位一致的快照。
 */
async function loadCommittedSnapshot(
  repository: InterviewAgentRepository,
  sessionId: string,
): Promise<AgentSnapshot> {
  const event = await repository.getLatestSnapshotEvent(sessionId);
  if (event.type !== "agent.snapshot") {
    throw new InterviewAgentRepositoryError(
      "agent_repository_invalid_output",
      "Agent persistence returned an invalid response.",
      500,
      false,
    );
  }
  return event.data;
}

/**
 * 把数据库冻结配置还原为 Graph 在 checkpoint 缺失时可重建的最小状态。
 *
 * @param projection - 已通过 RLS 读取的 Agent 会话投影。
 * @returns 不含回答正文或凭据的准备状态。
 */
function stateFromProjection(
  projection: AgentSessionProjection,
): InterviewAgentState {
  const config = FrozenAgentConfigSchema.parse(projection.agentConfig);
  const rolePlan = buildRolePlan(projection.mode, config.questionCount);
  return {
    version: "agent-v1",
    sessionId: projection.sessionId,
    userId: projection.userId,
    mode: projection.mode,
    phase: "preparing",
    config,
    rolePlan,
    currentRole: rolePlan[0].roleId,
    currentQuestionId: null,
    currentQuestionIndex: 0,
    followUpCount: 0,
    coveredDimensions: [],
    latestInputId: null,
    latestEvidenceIds: [],
    pendingAction: "ask",
  };
}

/**
 * 验证 Graph 返回的状态仍属于当前会话和用户。
 *
 * @param value - invoke 或 getState 返回的未知状态。
 * @param sessionId - 预期业务会话 UUID。
 * @param userId - 预期会话所有者 UUID。
 * @returns 已剥离 LangGraph 运行元数据的核心状态。
 */
function parseOwnedGraphState(
  value: unknown,
  sessionId: string,
  userId: string,
): InterviewAgentState {
  const state = InterviewAgentStateSchema.parse(value);
  if (state.sessionId !== sessionId || state.userId !== userId) {
    throw new InterviewAgentServiceError(
      "agent_graph_unavailable",
      "The Agent graph state could not be restored.",
      503,
      true,
    );
  }
  return state;
}

/**
 * 尽力把已 claim 操作标记为失败，且不让第二个数据库错误覆盖原业务错误。
 *
 * @param repository - 当前用户作用域 Repository。
 * @param sessionId - Agent 会话 UUID。
 * @param operationKey - 已 claim 的幂等键。
 * @param errorCode - 不含底层异常文本的稳定错误码。
 */
async function markOperationFailed(
  repository: InterviewAgentRepository,
  sessionId: string,
  operationKey: string,
  errorCode: string,
): Promise<void> {
  try {
    await repository.failOperation({ sessionId, operationKey, errorCode });
  } catch {
    logger.warn("agent_operation_failure_marker_unavailable", {
      sessionId,
      operationKey,
      errorCode,
    });
  }
}

/** Interview Agent Phase 1 的受控业务服务。 */
export class InterviewAgentService {
  /**
   * 创建绑定当前用户的 Service。
   *
   * @param dependencies - Repository、Graph 工厂、运行配置和模型解析器。
   */
  constructor(
    private readonly dependencies: InterviewAgentServiceDependencies,
  ) {}

  /**
   * 创建 Agent 会话并用 Mock Graph 准备到第一个 interrupt。
   *
   * 业务会话与初始快照先由数据库 RPC 原子创建；随后 Graph checkpoint 到等待输入，
   * 再用 prepare operation 原子提交阶段和快照。准备失败时保留 202 创建结果，允许 retry。
   *
   * @param input - 已通过 HTTP Zod 校验的创建参数。
   * @returns 规范要求的 HTTP 202 创建结果。
   */
  async createSession(
    input: CreateAgentSessionInput,
  ): Promise<CreateAgentSessionResponse> {
    if (!this.dependencies.runtimeConfig.enabled) {
      throw new InterviewAgentServiceError(
        "agent_interview_disabled",
        "New Agent interviews are currently disabled.",
        503,
        false,
      );
    }

    // 在数据库创建前解析 Graph 配置，缺少 DATABASE_URL 时不留下不可恢复的孤儿会话。
    const graph = this.dependencies.getGraph();
    const model = await this.dependencies.resolveModel(input);
    const resolvedInput = {
      ...input,
      modelProvider: model.name,
      modelName: model.model,
      webResearch:
        (input.webResearch ?? true) &&
        this.dependencies.runtimeConfig.webResearchEnabled,
      promptVersion: this.dependencies.runtimeConfig.promptVersion,
    };
    const created = await this.dependencies.repository.createSession(
      resolvedInput,
    );

    try {
      await this.prepareSession(graph, created, resolvedInput);
    } catch {
      // 创建响应必须仍然让客户端获得 sessionId，retry 可在 checkpoint/DB 恢复后继续。
      logger.error(new Error("Agent preparation failed"), {
        event: "agent_preparation_failed",
        sessionId: created.sessionId,
      });
    }
    return created;
  }

  /**
   * 读取当前用户可访问的最后已提交 Agent 快照。
   *
   * @param sessionId - Agent 会话 UUID。
   * @returns 与 SSE 使用同一业务事件真相的视图。
   */
  async getSession(sessionId: string): Promise<AgentSessionView> {
    await this.dependencies.repository.getOwnedSessionProjection(sessionId);
    return {
      snapshot: await loadCommittedSnapshot(
        this.dependencies.repository,
        sessionId,
      ),
    };
  }

  /**
   * 只执行所有权和 Agent 版本检查，供 SSE 在发送响应头之前鉴权。
   *
   * @param sessionId - Agent 会话 UUID。
   */
  async assertSessionReadable(sessionId: string): Promise<void> {
    await this.dependencies.repository.getOwnedSessionProjection(sessionId);
  }

  /**
   * 以 inputId claim 后恢复 Graph，成功时原子提交 completed 阶段与事件。
   *
   * 回答正文不传给 `Command.resume`；Phase 1 只验证 ID 恢复骨架，Phase 3 会先把正文写入
   * `interview_messages`，再由 Graph 按 inputId 加载。重复 inputId 不会再次 invoke Graph。
   *
   * @param sessionId - Agent 会话 UUID。
   * @param input - 已校验文本输入；content 不进入 checkpoint。
   * @param source - 文本框或 ASR 来源；两种通道共享完全相同的 Graph 恢复路径。
   * @returns 幂等元数据和数据库最新快照。
   */
  async submitInput(
    sessionId: string,
    input: AgentInput,
    source: "text" | "voice" = "text",
  ): Promise<AgentInputResponse> {
    const operationKey = `input:${input.inputId}`;
    if (this.dependencies.inputRepository) {
      try {
        await this.dependencies.inputRepository.acceptInput({
          sessionId,
          inputId: input.inputId,
          content: input.content,
          source,
        });
      } catch (error) {
        if (error instanceof AgentInputRepositoryError) {
          const code = error.code === "not_found"
            ? "agent_session_not_found"
            : error.code === "invalid_phase"
              ? "agent_invalid_phase"
              : "agent_graph_unavailable";
          throw new InterviewAgentServiceError(
            code,
            error.code === "not_found"
              ? "The Agent session was not found."
              : error.code === "invalid_phase"
                ? "The Agent is not waiting for an answer."
                : "The Agent input could not be persisted.",
            error.statusCode,
            error.retryable,
          );
        }
        throw new InterviewAgentServiceError(
          "agent_graph_unavailable",
          "The Agent input could not be persisted.",
          503,
          true,
        );
      }
    }
    const claim = await this.dependencies.repository.claimOperation({
      sessionId,
      operationKey,
      nodeName: INPUT_NODE_NAME,
    });

    if (claim.duplicate) {
      return {
        duplicate: true,
        operationKey,
        snapshot: await loadCommittedSnapshot(
          this.dependencies.repository,
          sessionId,
        ),
      };
    }
    if (!claim.claimed || claim.inProgress) {
      throw new InterviewAgentServiceError(
        "agent_operation_in_progress",
        "The same Agent operation is already in progress.",
        409,
        true,
      );
    }

    try {
      const before =
        await this.dependencies.repository.getOwnedSessionProjection(
          sessionId,
        );
      const expectedPhase = this.dependencies.inputRepository
        ? "reasoning"
        : "awaiting_answer";
      if (before.phase !== expectedPhase) {
        throw new InterviewAgentServiceError(
          "agent_invalid_phase",
          "The Agent is not waiting for an answer.",
          409,
          false,
        );
      }

      const graph = this.dependencies.getGraph();
      const invoked = await graph.invoke(
        createAgentResumeCommand(input.inputId),
        createAgentGraphConfig(sessionId),
      );
      const state = parseOwnedGraphState(
        invoked,
        sessionId,
        this.dependencies.userId,
      );
      if (state.phase === "awaiting_answer") {
        const snapshot = createAgentSnapshot(state, before.eventCursor + 2);
        await this.dependencies.repository.commitOperation({
          sessionId,
          operationKey,
          nodeName: INPUT_NODE_NAME,
          phase: "awaiting_answer",
          currentRole: state.currentRole,
          result: {
            phase: "awaiting_answer",
            latestInputId: state.latestInputId,
            disposition: state.pendingAction,
          },
          events: [
            { type: "agent.phase", data: { phase: "awaiting_answer" } },
            { type: "agent.snapshot", data: snapshot },
          ],
        });
        return {
          duplicate: false,
          operationKey,
          snapshot: await loadCommittedSnapshot(
            this.dependencies.repository,
            sessionId,
          ),
        };
      }
      if (state.phase !== "completed") {
        throw new InterviewAgentServiceError(
          "agent_graph_unavailable",
          "The Agent graph did not complete the Phase 1 resume.",
          503,
          true,
        );
      }

      const completedAt = new Date().toISOString();
      const reportFinalized = this.dependencies.reportFinalizedInGraph === true;
      const snapshot = createAgentSnapshot(
        state,
        before.eventCursor + (reportFinalized ? 2 : 3),
      );
      const events: AgentEventDraft[] = [
        { type: "agent.phase", data: { phase: "completed" } },
        ...(!reportFinalized ? [{
          type: "agent.session_completed",
          data: { sessionId, completedAt },
        } as const] : []),
        { type: "agent.snapshot", data: snapshot },
      ];
      await this.dependencies.repository.commitOperation({
        sessionId,
        operationKey,
        nodeName: INPUT_NODE_NAME,
        phase: "completed",
        currentRole: state.currentRole,
        result: {
          phase: "completed",
          latestInputId: state.latestInputId,
          completedAt,
        },
        events,
      });

      return {
        duplicate: false,
        operationKey,
        snapshot: await loadCommittedSnapshot(
          this.dependencies.repository,
          sessionId,
        ),
      };
    } catch (error) {
      await markOperationFailed(
        this.dependencies.repository,
        sessionId,
        operationKey,
        error instanceof InterviewAgentServiceError
          ? error.code
          : "agent_graph_resume_failed",
      );
      if (
        error instanceof InterviewAgentServiceError ||
        error instanceof InterviewAgentRepositoryError
      ) {
        throw error;
      }
      throw new InterviewAgentServiceError(
        "agent_graph_unavailable",
        "The Agent graph could not be resumed.",
        503,
        true,
      );
    }
  }

  /**
   * 确认打断请求；Phase 1 Mock 图没有活动 LLM/TTS 流，因此只返回当前快照。
   *
   * @param sessionId - Agent 会话 UUID。
   * @returns 明确的 no_active_output 结果，后续语音阶段会接入 AbortSignal。
   */
  async interruptSession(sessionId: string): Promise<AgentInterruptResponse> {
    const view = await this.getSession(sessionId);
    return { ...view, accepted: false, reason: "no_active_output" };
  }

  /**
   * Phase 1 不伪造答案来强制结束等待中的 Graph。
   *
   * @param sessionId - Agent 会话 UUID。
   * @returns 已完成会话的现有视图。
   */
  async finishSession(sessionId: string): Promise<AgentSessionView> {
    const view = await this.getSession(sessionId);
    if (view.snapshot.phase === "completed") return view;
    throw new InterviewAgentServiceError(
      "agent_finish_not_available",
      "Finishing an active Agent interview is not available in Phase 1.",
      409,
      false,
    );
  }

  /**
   * 重试尚未完成的准备操作，并优先复用 checkpoint 中已有进度。
   *
   * @param sessionId - Agent 会话 UUID。
   * @returns 重试后的最新已提交快照。
   */
  async retrySession(sessionId: string): Promise<AgentRetryResponse> {
    const projection =
      await this.dependencies.repository.getOwnedSessionProjection(sessionId);
    if (projection.phase !== "preparing" && projection.phase !== "failed") {
      throw new InterviewAgentServiceError(
        "agent_invalid_phase",
        "Only a preparing or failed Agent session can be retried.",
        409,
        false,
      );
    }

    const graph = this.dependencies.getGraph();
    const duplicate = await this.prepareFromProjection(graph, projection);
    return {
      duplicate,
      snapshot: await loadCommittedSnapshot(
        this.dependencies.repository,
        sessionId,
      ),
    };
  }

  /**
   * 新建会话后运行 Graph 到 interrupt 并提交 awaiting_answer 快照。
   *
   * @param graph - 已编译 Graph。
   * @param created - create RPC 返回的会话标识和初始事件水位。
   * @param input - 已解析模型和全局开关的内部创建配置。
   */
  private async prepareSession(
    graph: InterviewAgentGraph,
    created: CreateAgentSessionResponse,
    input: CreateAgentSessionInput & { promptVersion: string },
  ): Promise<void> {
    const claim = await this.dependencies.repository.claimOperation({
      sessionId: created.sessionId,
      operationKey: PREPARE_OPERATION_KEY,
      nodeName: PREPARE_NODE_NAME,
    });
    if (claim.duplicate) return;
    if (!claim.claimed || claim.inProgress) {
      throw new InterviewAgentServiceError(
        "agent_operation_in_progress",
        "The Agent preparation operation is already in progress.",
        409,
        true,
      );
    }

    try {
      const initialState = createInitialAgentState({
        sessionId: created.sessionId,
        userId: this.dependencies.userId,
        input,
        promptVersion: input.promptVersion,
        webResearchEnabled:
          this.dependencies.runtimeConfig.webResearchEnabled,
      });
      const preparation = await this.preparePlanIfConfigured(
        created.sessionId,
        input.mode,
        initialState.config,
      );
      const preparedQuestionId = preparation ? randomUUID() : undefined;
      const invoked = await graph.invoke(
        createInitialAgentState({
          sessionId: created.sessionId,
          userId: this.dependencies.userId,
          input,
          promptVersion: input.promptVersion,
          webResearchEnabled:
            this.dependencies.runtimeConfig.webResearchEnabled,
          preparedQuestionId,
        }),
        createAgentGraphConfig(created.sessionId),
      );
      const state = parseOwnedGraphState(
        invoked,
        created.sessionId,
        this.dependencies.userId,
      );
      if (preparation && preparedQuestionId) {
        await this.commitPreparedPlan(
          state,
          created.eventCursor,
          preparation,
          preparedQuestionId,
        );
      } else {
        await this.commitPreparedState(state, created.eventCursor);
      }
    } catch (error) {
      await markOperationFailed(
        this.dependencies.repository,
        created.sessionId,
        PREPARE_OPERATION_KEY,
        "agent_preparation_failed",
      );
      throw error;
    }
  }

  /**
   * 仅当生产依赖完整配置时执行 Phase 2 准备，避免测试 fake 意外形成半配置状态。
   *
   * @param sessionId - Agent 会话 UUID。
   * @param mode - 单角色或固定面板模式。
   * @param config - 创建时冻结的无凭据配置。
   * @returns 冻结准备计划；Phase 1 测试路径返回 null。
   */
  private async preparePlanIfConfigured(
    sessionId: string,
    mode: AgentSessionProjection["mode"],
    config: FrozenAgentConfig,
  ) {
    const service = this.dependencies.preparationService;
    const repository = this.dependencies.preparationRepository;
    if (!service && !repository) return null;
    if (!service || !repository) {
      throw new InterviewAgentServiceError(
        "agent_graph_unavailable",
        "The Agent preparation service is not configured correctly.",
        503,
        true,
      );
    }
    return service.prepare({ sessionId, mode, config });
  }

  /**
   * 将 Phase 2 冻结计划、研究、首题、事件和投影交给单个数据库事务提交。
   *
   * @param state - 已到达输入 interrupt 的 Graph State。
   * @param previousCursor - 准备前事件水位。
   * @param plan - Skill、简历、研究和能力蓝图生成的冻结计划。
   * @param questionId - 新建业务题目 UUID。
   */
  private async commitPreparedPlan(
    state: InterviewAgentState,
    previousCursor: number,
    plan: Awaited<ReturnType<InterviewPreparationService["prepare"]>>,
    questionId: string,
  ): Promise<void> {
    const repository = this.dependencies.preparationRepository;
    if (!repository || state.phase !== "awaiting_answer" || state.currentQuestionId !== questionId) {
      throw new InterviewAgentServiceError(
        "agent_graph_unavailable",
        "The Agent graph did not reach the prepared input interrupt.",
        503,
        true,
      );
    }
    const roleId = plan.questionRoles[0];
    const dimensionKey = plan.questionDimensions[0];
    const snapshot = createAgentSnapshot(state, previousCursor + 3);
    await repository.commitPreparation({
      sessionId: state.sessionId,
      operationKey: PREPARE_OPERATION_KEY,
      nodeName: PREPARE_NODE_NAME,
      currentRole: roleId,
      plan,
      question: {
        id: questionId,
        question: plan.firstQuestion.question,
        roleId,
        dimensionKey,
        source: plan.firstQuestion.source,
        bankQuestionId:
          plan.firstQuestion.source === "bank" ? plan.firstQuestion.id : null,
      },
      result: {
        phase: "awaiting_answer",
        questionId,
        planVersion: plan.version,
        researchStatus: plan.researchStatus,
      },
      events: [
        { type: "agent.phase", data: { phase: "awaiting_answer" } },
        {
          type: "agent.question_ready",
          data: {
            id: questionId,
            question: plan.firstQuestion.question,
            orderIndex: 0,
            roleId,
            dimensionKey,
            source: plan.firstQuestion.source,
          },
        },
        { type: "agent.snapshot", data: snapshot },
      ],
    });
  }

  /**
   * 从 checkpoint 继续准备节点；checkpoint 不存在时由业务投影重建初始状态。
   *
   * @param graph - 已编译 Graph。
   * @param projection - 当前已提交业务投影。
   * @returns 是否命中已经完成的 prepare operation。
   */
  private async prepareFromProjection(
    graph: InterviewAgentGraph,
    projection: AgentSessionProjection,
  ): Promise<boolean> {
    const claim = await this.dependencies.repository.claimOperation({
      sessionId: projection.sessionId,
      operationKey: PREPARE_OPERATION_KEY,
      nodeName: PREPARE_NODE_NAME,
    });
    if (claim.duplicate) return true;
    if (!claim.claimed || claim.inProgress) {
      throw new InterviewAgentServiceError(
        "agent_operation_in_progress",
        "The Agent preparation operation is already in progress.",
        409,
        true,
      );
    }

    try {
      const restoredConfig = FrozenAgentConfigSchema.parse(projection.agentConfig);
      const preparation = await this.preparePlanIfConfigured(
        projection.sessionId,
        projection.mode,
        restoredConfig,
      );
      const fallbackQuestionId = preparation ? randomUUID() : null;
      const config = createAgentGraphConfig(projection.sessionId);
      const saved = await graph.getState(config);
      const parsedSaved = InterviewAgentStateSchema.safeParse(saved.values);
      let state: InterviewAgentState;

      if (parsedSaved.success && parsedSaved.data.phase === "awaiting_answer") {
        state = parsedSaved.data;
      } else if (parsedSaved.success && saved.next.length > 0) {
        state = parseOwnedGraphState(
          await graph.invoke(null, config),
          projection.sessionId,
          projection.userId,
        );
      } else {
        state = parseOwnedGraphState(
          await graph.invoke(
            {
              ...stateFromProjection(projection),
              currentQuestionId: fallbackQuestionId,
            },
            config,
          ),
          projection.sessionId,
          projection.userId,
        );
      }

      if (preparation && state.currentQuestionId) {
        await this.commitPreparedPlan(
          state,
          projection.eventCursor,
          preparation,
          state.currentQuestionId,
        );
      } else {
        await this.commitPreparedState(state, projection.eventCursor);
      }
      return false;
    } catch (error) {
      await markOperationFailed(
        this.dependencies.repository,
        projection.sessionId,
        PREPARE_OPERATION_KEY,
        "agent_preparation_retry_failed",
      );
      throw error;
    }
  }

  /**
   * 将 Graph 的等待输入状态原子投影为 phase + snapshot 两个事件。
   *
   * @param state - 已恢复且属于当前用户的 Graph 状态。
   * @param previousCursor - 提交前业务事件水位，仅供构造草稿；RPC 会覆盖真实 snapshot 游标。
   */
  private async commitPreparedState(
    state: InterviewAgentState,
    previousCursor: number,
  ): Promise<void> {
    if (state.phase !== "awaiting_answer" || !state.currentQuestionId) {
      throw new InterviewAgentServiceError(
        "agent_graph_unavailable",
        "The Agent graph did not reach the input interrupt.",
        503,
        true,
      );
    }
    const snapshot = createAgentSnapshot(state, previousCursor + 2);
    await this.dependencies.repository.commitOperation({
      sessionId: state.sessionId,
      operationKey: PREPARE_OPERATION_KEY,
      nodeName: PREPARE_NODE_NAME,
      phase: "awaiting_answer",
      currentRole: state.currentRole,
      result: {
        phase: "awaiting_answer",
        questionId: state.currentQuestionId,
      },
      events: [
        { type: "agent.phase", data: { phase: "awaiting_answer" } },
        { type: "agent.snapshot", data: snapshot },
      ],
    });
  }
}

/**
 * 为 Hono 请求创建绑定当前用户的生产 Service。
 *
 * Provider resolver 可能在调用栈中短暂持有解密 API Key，但这里只复制 name/model，
 * Key 不会传给 Repository、Graph、事件或 checkpoint。
 *
 * @param supabase - 携带当前用户 JWT 的 Supabase client。
 * @param userId - requireAuth 验证的用户 UUID。
 * @returns 使用 PostgresSaver 与用户作用域 Repository 的 Service。
 */
export function createInterviewAgentService(
  supabase: UserSupabaseClient,
  userId: string,
): InterviewAgentService {
  const preparationRepository = createInterviewPreparationRepository(supabase);
  const inputRepository = createAgentInputRepository(supabase);
  const agentRunAuditor = createAgentRunAuditor(supabase);
  const agentModelProvider = createProductionAgentModelProvider(
    supabase,
    userId,
    agentRunAuditor,
  );
  const questionRuntimeService = new DefaultQuestionRuntimeService({
    runtimeRepository: createQuestionRuntimeRepository(supabase),
    preparationRepository,
    modelProvider: agentModelProvider,
  });
  const evaluationService = new QuestionEvaluationService(
    createAgentEvaluationRepository(supabase),
    createAgentEvaluationModelProvider(supabase, userId, agentRunAuditor),
  );
  const reportService = new DefaultAgentReportService(
    createAgentReportRepository(supabase),
  );
  return new InterviewAgentService({
    repository: createInterviewAgentRepository(supabase),
    userId,
    getGraph: () => getDefaultInterviewAgentGraph(
      inputRepository,
      questionRuntimeService,
      agentModelProvider,
      evaluationService,
      reportService,
    ),
    runtimeConfig: getAgentRuntimeConfig(),
    preparationRepository,
    inputRepository,
    reportFinalizedInGraph: true,
    preparationService: new InterviewPreparationService({
      tools: createDefaultInterviewAgentTools(preparationRepository),
      webSearchProvider: createWebSearchProviderFromEnv(),
      // Adapter 在调用栈解析用户 BYOK；凭据不会进入 Graph State 或 checkpoint。
      modelProvider: agentModelProvider,
      loadResearchSources(sessionId) {
        return preparationRepository.loadResearchSources(sessionId);
      },
    }),
    async resolveModel(input) {
      const provider = await resolveProviderForCreation(
        supabase,
        userId,
        input,
      );
      return { name: provider.name, model: provider.model };
    },
  });
}
