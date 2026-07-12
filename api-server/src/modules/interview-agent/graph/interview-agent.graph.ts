/** Interview Agent Phase 1 的 LangGraph 状态、最小受控图与安全恢复辅助函数。 */
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  Annotation,
  Command,
  END,
  START,
  StateGraph,
  interrupt,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import { PROVIDER_CONFIGS } from "../../../shared/ai/providers.js";
import type { CreateAgentSessionInput } from "../interview-agent.schemas.js";
import type {
  AgentSnapshot,
  FrozenAgentConfig,
  InterviewAgentState,
  RoleStage,
} from "../interview-agent.types.js";
import {
  createDeterministicMockAgentModelProvider,
  type AgentModelProvider,
  type AgentInterviewerModelProvider,
} from "../providers/agent-model.provider.js";
import { buildRolePlan, getRolePersona } from "../roles/personas.js";
import {
  AGENT_CHECKPOINT_NAMESPACE,
  withAgentCheckpointNamespace,
} from "./checkpointer.js";
import type { AgentInputRepository } from "../input/input.repository.js";
import { buildInputRedirect, guardAgentInput } from "./input-guard.js";
import {
  assessAnswerSufficiency,
  buildFocusedFollowUp,
} from "./answer-sufficiency.js";
import type { QuestionRuntimeService } from "../runtime/question-runtime.service.js";

/** Graph 等待业务消息持久化后发出的安全 interrupt 数据。 */
export type AgentInputRequiredInterrupt = Readonly<{
  /** 稳定中断类型，供 API/Worker 判别恢复动作。 */
  type: "agent.input.required";
  /** 与 LangGraph `thread_id` 相同的业务会话标识。 */
  sessionId: string;
  /** 正在等待回答的业务题目标识。 */
  questionId: string;
  /** 明确提示调用方只能用输入 ID 恢复，正文不得进入 Command。 */
  resumeWith: "inputId";
}>;

/** Graph 恢复时唯一允许进入 LangGraph checkpoint 的用户输入引用。 */
export type AgentResumeInput = Readonly<{
  /** 已先写入业务消息表的幂等输入标识；不包含回答正文。 */
  inputId: string;
}>;

/** 编译 Phase 1 Graph 所需的可替换依赖。 */
export type CompileInterviewAgentGraphOptions = Readonly<{
  /** MemorySaver 或 PostgreSQL saver；interrupt 必须依赖 checkpointer 才能恢复。 */
  checkpointer: BaseCheckpointSaver;
  /** 可选模型适配器；缺省时使用确定性 Mock，绝不访问网络。 */
  modelProvider?: AgentModelProvider;
  /** Phase 3 按 inputId 加载回答并原子保存 redirect/follow-up 的业务 Repository。 */
  inputRepository?: AgentInputRepository;
  /** Phase 3 按冻结计划选择并提交后续题目的运行时服务。 */
  questionRuntimeService?: QuestionRuntimeService;
  /** Persona 驱动的真实追问模型；控制流仍由确定性节点决定。 */
  interviewerModelProvider?: AgentInterviewerModelProvider;
}>;

/** 创建初始 Agent State 所需的业务参数。 */
export type CreateInitialAgentStateParams = Readonly<{
  /** 新建业务会话 UUID，同时固定为 LangGraph `thread_id`。 */
  sessionId: string;
  /** 已鉴权的会话所有者标识。 */
  userId: string;
  /** 通过 `CreateAgentSessionSchema` 校验后的创建参数。 */
  input: CreateAgentSessionInput;
  /** 已解析的 Prompt 版本；缺省时兼容读取 `AGENT_PROMPT_VERSION`。 */
  promptVersion?: string;
  /** 全局联网研究开关；请求开关与该值同时为 true 才会冻结为启用。 */
  webResearchEnabled?: boolean;
  /** Phase 2 已原子规划的业务首题 UUID；存在时 ask 节点不再次生成。 */
  preparedQuestionId?: string;
}>;

/**
 * InterviewAgentState 的 LangGraph Annotation 定义。
 *
 * Annotation 只声明核心可恢复状态，不声明回答正文、API Key、Authorization、数据库 URL 或
 * 原始音频字段；未知初始输入也不会成为状态 channel。
 */
export const AgentStateAnnotation = Annotation.Root({
  version: Annotation<InterviewAgentState["version"]>(),
  sessionId: Annotation<string>(),
  userId: Annotation<string>(),
  mode: Annotation<InterviewAgentState["mode"]>(),
  phase: Annotation<InterviewAgentState["phase"]>(),
  config: Annotation<FrozenAgentConfig>(),
  rolePlan: Annotation<RoleStage[]>(),
  currentRole: Annotation<InterviewAgentState["currentRole"]>(),
  currentQuestionId: Annotation<string | null>(),
  currentQuestionIndex: Annotation<number>(),
  followUpCount: Annotation<number>(),
  coveredDimensions: Annotation<string[]>(),
  latestInputId: Annotation<string | null>(),
  latestEvidenceIds: Annotation<string[]>(),
  pendingAction: Annotation<InterviewAgentState["pendingAction"]>(),
});

/** 与公共契约结构一致的 LangGraph 推断状态。 */
export type AgentGraphState = typeof AgentStateAnnotation.State;

/** `AgentStateAnnotation` 的语义化兼容导出。 */
export const InterviewAgentStateAnnotation = AgentStateAnnotation;

/** Phase 1 compiled graph 接受的节点名称联合。 */
export type AgentGraphNodeName =
  | "__start__"
  | "hydrate_context"
  | "research_context"
  | "build_interview_plan"
  | "select_question"
  | "wait_for_input"
  | "guard_input"
  | "extract_evidence"
  | "decide_followup"
  | "interviewer_respond"
  | "score_question"
  | "advance_stage"
  | "finalize_report";

/** 与 Phase 1 compiled graph invoke 输入严格兼容的恢复 Command。 */
export type AgentResumeCommand = Command<
  unknown,
  Partial<AgentGraphState>,
  AgentGraphNodeName
>;

/**
 * 为指定会话构建固定 LangGraph 运行配置。
 *
 * @param sessionId - 业务会话标识；v1 中不可替换为用户 ID 或随机线程 ID。
 * @returns 固定使用 `thread_id=sessionId` 与 `checkpoint_ns=agent-v1` 的配置。
 */
export function createAgentGraphConfig(sessionId: string): RunnableConfig {
  if (!sessionId.trim()) {
    throw new Error("sessionId is required for the Agent graph");
  }
  return {
    configurable: {
      thread_id: sessionId,
      checkpoint_ns: AGENT_CHECKPOINT_NAMESPACE,
    },
  };
}

/**
 * 从已校验创建参数构建不含凭据和回答正文的初始可恢复状态。
 *
 * @param params - 会话、用户和创建请求参数。
 * @returns 处于 preparing 阶段且角色计划已冻结的 Agent v1 状态。
 */
export function createInitialAgentState(
  params: CreateInitialAgentStateParams,
): InterviewAgentState {
  const rolePlan = buildRolePlan(params.input.mode, params.input.questionCount);
  const modelProvider = params.input.modelProvider ?? "deepseek";
  const globalWebResearchEnabled =
    params.webResearchEnabled ??
    process.env.AGENT_WEB_RESEARCH_ENABLED !== "0";
  const config: FrozenAgentConfig = Object.freeze({
    interviewMode: params.input.interviewMode,
    position: params.input.position,
    difficulty: params.input.difficulty,
    questionCount: params.input.questionCount,
    jobDescription: params.input.jobDescription ?? null,
    targetCompany: params.input.targetCompany ?? null,
    skillId: params.input.skillId ?? null,
    resumeId: params.input.resumeId ?? null,
    modelProvider,
    modelName:
      params.input.modelName ?? PROVIDER_CONFIGS[modelProvider].defaultModel,
    webResearch: (params.input.webResearch ?? true) && globalWebResearchEnabled,
    promptVersion:
      params.promptVersion?.trim() ||
      process.env.AGENT_PROMPT_VERSION?.trim() ||
      "agent-v1",
  });

  return {
    version: "agent-v1",
    sessionId: params.sessionId,
    userId: params.userId,
    mode: params.input.mode,
    phase: "preparing",
    config,
    rolePlan,
    currentRole: rolePlan[0].roleId,
    currentQuestionId: params.preparedQuestionId ?? null,
    currentQuestionIndex: 0,
    followUpCount: 0,
    coveredDimensions: [],
    latestInputId: null,
    latestEvidenceIds: [],
    pendingAction: "ask",
  };
}

/**
 * 将可恢复 Graph 状态投影为客户端 Agent Snapshot。
 *
 * @param state - Graph invoke 结果或 `getState().values`。
 * @param eventCursor - 已提交 Agent 事件的最后序号。
 * @returns 不含用户 ID、模型配置或其他服务端字段的客户端快照。
 */
export function createAgentSnapshot(
  state: InterviewAgentState,
  eventCursor = 0,
): AgentSnapshot {
  if (!Number.isInteger(eventCursor) || eventCursor < 0) {
    throw new RangeError("eventCursor must be a non-negative integer");
  }
  return {
    sessionId: state.sessionId,
    threadId: state.sessionId,
    version: state.version,
    mode: state.mode,
    interviewMode: state.config.interviewMode,
    phase: state.phase,
    currentRole: state.currentRole,
    currentQuestionId: state.currentQuestionId,
    currentQuestionIndex: state.currentQuestionIndex,
    followUpCount: state.followUpCount,
    pendingAction: state.pendingAction,
    eventCursor,
  };
}

/**
 * 构建只携带业务输入 ID 的恢复 Command。
 *
 * 回答正文必须先写入 `interview_messages`，Graph 后续节点再按 ID 加载；该辅助函数从 API
 * 边界阻止正文或 API Key 被作为 resume value 持久化到 checkpoint。
 *
 * @param inputId - 已持久化用户消息的幂等输入标识。
 * @returns 仅包含 `{ inputId }` 的 LangGraph resume Command。
 */
export function createAgentResumeCommand(
  inputId: string,
): AgentResumeCommand {
  const normalizedInputId = inputId.trim();
  if (!normalizedInputId || normalizedInputId.length > 200) {
    throw new Error("inputId must contain between 1 and 200 characters");
  }
  return new Command<
    unknown,
    Partial<AgentGraphState>,
    AgentGraphNodeName
  >({
    resume: { inputId: normalizedInputId },
  });
}

/**
 * 严格解析 interrupt 的恢复值，只允许安全输入引用。
 *
 * @param value - LangGraph 从 `Command.resume` 交还给节点的值。
 * @returns 仅含规范化 inputId 的恢复输入。
 */
function parseAgentResumeInput(value: unknown): AgentResumeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Agent graph resume value must be { inputId }");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 1 ||
    typeof record.inputId !== "string" ||
    !record.inputId.trim() ||
    record.inputId.trim().length > 200
  ) {
    throw new TypeError("Agent graph resume value must only contain a valid inputId");
  }
  return { inputId: record.inputId.trim() };
}

/**
 * 编译 Interview Agent 主图；准备、输入、追问、推进和结束都具有显式节点边界。
 *
 * `wait_for_input` 使用动态 `interrupt()`；恢复值只保留消息 ID，回答正文和模型凭据既不是
 * Annotation channel，也不会被节点返回。ask 节点调用模型适配器，但只把题目 ID 写入状态，
 * 题目正文由后续业务投影层负责持久化。
 *
 * @param options - 必需 checkpointer 与可选模型适配器。
 * @returns 可 invoke、恢复及读取状态的已编译 LangGraph。
 */
export function compileInterviewAgentGraph(
  options: CompileInterviewAgentGraphOptions,
) {
  const modelProvider =
    options.modelProvider ?? createDeterministicMockAgentModelProvider();

  /** 加载恢复状态中的冻结配置并补齐确定性角色计划。 */
  const hydrateContext = (state: AgentGraphState): Partial<AgentGraphState> => {
    const rolePlan =
      state.rolePlan.length > 0
        ? state.rolePlan
        : buildRolePlan(state.mode, state.config.questionCount);
    return {
      phase: "preparing",
      rolePlan,
      currentRole: rolePlan[0].roleId,
      pendingAction: "ask",
    };
  };

  /**
   * 标记研究上下文边界；联网只在首次准备服务执行，恢复时复用数据库缓存而不再次联网。
   */
  const researchContext = (): Partial<AgentGraphState> => ({
    phase: "preparing",
  });

  /** 构建/恢复首题引用；Phase 2 已提交首题时不会再次调用模型。 */
  const buildInterviewPlan = async (
    state: AgentGraphState,
  ): Promise<Partial<AgentGraphState>> => {
    // Phase 2 已经完成题库优先选择时，Graph 只引用业务题目，避免重复调用模型。
    if (state.currentQuestionId) {
      return {
        currentQuestionId: state.currentQuestionId,
        pendingAction: "ask",
      };
    }
    const persona = getRolePersona(state.currentRole);
    const generated = await modelProvider.generateQuestion({
      sessionId: state.sessionId,
      questionIndex: state.currentQuestionIndex,
      roleId: state.currentRole,
      persona,
      position: state.config.position,
      difficulty: state.config.difficulty,
      promptVersion: state.config.promptVersion,
      modelProvider: state.config.modelProvider,
      modelName: state.config.modelName,
    });
    if (!generated.questionId.trim() || !generated.content.trim()) {
      throw new Error("Agent model provider returned an empty question");
    }
    return {
      currentQuestionId: generated.questionId,
      pendingAction: "ask",
    };
  };

  /** 在 checkpoint 边界暂停，并在恢复时只记录已持久化消息的 inputId。 */
  const waitForInput = (state: AgentGraphState): Partial<AgentGraphState> => {
    if (!state.currentQuestionId) {
      throw new Error("Agent cannot wait for input without a current question");
    }
    const resumeValue = interrupt<AgentInputRequiredInterrupt, AgentResumeInput>({
      type: "agent.input.required",
      sessionId: state.sessionId,
      questionId: state.currentQuestionId,
      resumeWith: "inputId",
    });
    const input = parseAgentResumeInput(resumeValue);
    return {
      phase: "reasoning",
      latestInputId: input.inputId,
      pendingAction: "finish",
    };
  };

  /**
   * 只按 inputId 临时加载回答并执行确定性 Guard；正文不会成为 Annotation channel。
   */
  const guardInput = async (
    state: AgentGraphState,
  ): Promise<Partial<AgentGraphState>> => {
    if (!options.inputRepository) {
      return { phase: "reasoning", pendingAction: "score" };
    }
    if (!state.latestInputId || !state.currentQuestionId) {
      throw new Error("Agent cannot guard input without message and question references");
    }
    const persisted = await options.inputRepository.loadInput(
      state.sessionId,
      state.latestInputId,
    );
    if (persisted.questionId !== state.currentQuestionId) {
      throw new Error("Persisted Agent input does not belong to the current question");
    }
    const guarded = guardAgentInput({
      content: persisted.content,
      question: persisted.question,
    });
    return {
      phase: "reasoning",
      pendingAction:
        guarded.disposition === "redirect" ? "follow_up" : "score",
    };
  };

  /**
   * 对 Guard 拒绝的输入提交一句安全引导；重放由业务 operationKey 返回首次消息。
   */
  const interviewerRespond = async (
    state: AgentGraphState,
  ): Promise<Partial<AgentGraphState>> => {
    if (!options.inputRepository || !state.latestInputId) {
      throw new Error("Agent interviewer response repository is unavailable");
    }
    const persisted = await options.inputRepository.loadInput(
      state.sessionId,
      state.latestInputId,
    );
    const guarded = guardAgentInput({
      content: persisted.content,
      question: persisted.question,
    });
    const responseType = guarded.disposition === "redirect"
      ? "redirect"
      : "follow_up";
    let content: string;
    if (guarded.disposition === "redirect") {
      content = buildInputRedirect(guarded.reason);
    } else {
      const sufficiency = assessAnswerSufficiency(persisted.content);
      if (sufficiency.sufficient) {
        throw new Error("Interviewer follow-up requires an evidence gap");
      }
      content = options.interviewerModelProvider
        ? (await options.interviewerModelProvider.generateFollowUp({
            sessionId: state.sessionId,
            roleId: state.currentRole,
            persona: getRolePersona(state.currentRole),
            question: persisted.question,
            answer: persisted.content,
            evidenceGap: sufficiency.gap,
            followUpNumber: state.followUpCount + 1,
            modelProvider: state.config.modelProvider,
            modelName: state.config.modelName,
            promptVersion: state.config.promptVersion,
          })).content
        : buildFocusedFollowUp(state.currentRole, sufficiency.gap);
    }
    const receipt = await options.inputRepository.commitInterviewerResponse({
      sessionId: state.sessionId,
      inputId: state.latestInputId,
      responseType,
      content,
    });
    return {
      phase: "awaiting_answer",
      followUpCount: receipt.followUpCount,
      pendingAction: "follow_up",
    };
  };

  /** Guard 分支完全由代码判定，模型不能改变 redirect 或继续处理。 */
  const routeGuardedInput = (state: AgentGraphState) =>
    state.pendingAction === "follow_up"
      ? "interviewer_respond"
      : "extract_evidence";

  /** Phase 3 先建立节点边界；Phase 4 会在此写入带原文引用的 answer_evidence。 */
  const extractEvidence = (): Partial<AgentGraphState> => ({
    phase: "reasoning",
    latestEvidenceIds: [],
    pendingAction: "score",
  });

  /**
   * 代码规则判断最低信息量，并在三次追问上限处强制进入评分分支。
   */
  const decideFollowUp = async (
    state: AgentGraphState,
  ): Promise<Partial<AgentGraphState>> => {
    if (!options.inputRepository || !state.latestInputId) {
      return { pendingAction: "score" };
    }
    if (state.followUpCount >= 3) return { pendingAction: "score" };
    const persisted = await options.inputRepository.loadInput(
      state.sessionId,
      state.latestInputId,
    );
    const sufficiency = assessAnswerSufficiency(persisted.content);
    return {
      pendingAction: sufficiency.sufficient ? "score" : "follow_up",
    };
  };

  /** 追问或评分分支只读取确定性 pendingAction。 */
  const routeFollowUp = (state: AgentGraphState) =>
    state.pendingAction === "follow_up"
      ? "interviewer_respond"
      : "score_question";

  /** Phase 3 建立正式评分节点边界；Phase 4 会在此提交冻结量表评分。 */
  const scoreQuestion = (): Partial<AgentGraphState> => ({
    phase: "scoring",
    pendingAction: "score",
  });

  /** 确定性推进题号和角色，模型不能改变总题数或角色顺序。 */
  const advanceStage = (state: AgentGraphState): Partial<AgentGraphState> => {
    const nextIndex = state.currentQuestionIndex + 1;
    if (!options.questionRuntimeService || nextIndex >= state.config.questionCount) {
      return { phase: "reporting", pendingAction: "finish" };
    }
    const stage = state.rolePlan.find(
      (candidate) =>
        nextIndex >= candidate.startQuestionIndex &&
        nextIndex <= candidate.endQuestionIndex,
    );
    if (!stage) throw new Error("Next question is outside the frozen role plan");
    const roleChanged = stage.roleId !== state.currentRole;
    return {
      phase: roleChanged ? "role_handoff" : "preparing",
      currentQuestionIndex: nextIndex,
      currentQuestionId: null,
      currentRole: stage.roleId,
      followUpCount: 0,
      latestInputId: null,
      latestEvidenceIds: [],
      pendingAction: roleChanged ? "handoff" : "ask",
    };
  };

  /** 按 plan-v1 当前索引题库优先选题，提交完成后才进入下一次 interrupt。 */
  const selectQuestion = async (
    state: AgentGraphState,
  ): Promise<Partial<AgentGraphState>> => {
    if (state.currentQuestionId) {
      return {
        phase: "awaiting_answer",
        currentQuestionId: state.currentQuestionId,
        currentRole: state.currentRole,
        pendingAction: "ask",
      };
    }
    if (!options.questionRuntimeService) {
      throw new Error("Agent question runtime service is unavailable");
    }
    const selected = await options.questionRuntimeService.selectAndCommit({
      sessionId: state.sessionId,
      questionIndex: state.currentQuestionIndex,
      roleId: state.currentRole,
    });
    return {
      phase: "awaiting_answer",
      currentQuestionId: selected.questionId,
      currentRole: selected.roleId,
      pendingAction: "ask",
    };
  };

  /** advance_stage 的完成或继续分支。 */
  const routeAdvancedStage = (state: AgentGraphState) =>
    state.pendingAction === "finish" ? "finalize_report" : "select_question";

  /** 结束所有冻结题目；Phase 4 会在这里读取冻结评分生成报告。 */
  const finalizeReport = (): Partial<AgentGraphState> => ({
    phase: "completed",
    pendingAction: "finish",
  });

  return new StateGraph(AgentStateAnnotation)
    .addNode("hydrate_context", hydrateContext)
    .addNode("research_context", researchContext)
    .addNode("build_interview_plan", buildInterviewPlan)
    .addNode("wait_for_input", waitForInput)
    .addNode("guard_input", guardInput)
    .addNode("extract_evidence", extractEvidence)
    .addNode("decide_followup", decideFollowUp)
    .addNode("interviewer_respond", interviewerRespond)
    .addNode("score_question", scoreQuestion)
    .addNode("advance_stage", advanceStage)
    .addNode("select_question", selectQuestion)
    .addNode("finalize_report", finalizeReport)
    .addEdge(START, "hydrate_context")
    .addEdge("hydrate_context", "research_context")
    .addEdge("research_context", "build_interview_plan")
    .addEdge("build_interview_plan", "select_question")
    .addEdge("wait_for_input", "guard_input")
    .addConditionalEdges("guard_input", routeGuardedInput, [
      "interviewer_respond",
      "extract_evidence",
    ])
    .addEdge("extract_evidence", "decide_followup")
    .addConditionalEdges("decide_followup", routeFollowUp, [
      "interviewer_respond",
      "score_question",
    ])
    .addEdge("interviewer_respond", "wait_for_input")
    .addEdge("score_question", "advance_stage")
    .addConditionalEdges("advance_stage", routeAdvancedStage, [
      "select_question",
      "finalize_report",
    ])
    .addEdge("select_question", "wait_for_input")
    .addEdge("finalize_report", END)
    .compile({
      checkpointer: withAgentCheckpointNamespace(options.checkpointer),
      name: "interview-agent-v1",
    });
}
