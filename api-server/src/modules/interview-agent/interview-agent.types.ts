/** Interview Agent 模块的状态、事件与 HTTP API 公共契约。 */

/** Agent 状态契约版本。 */
export type AgentVersion = "agent-v1";

/** 面试角色编排模式。 */
export type AgentMode = "single" | "panel";

/** 用户参与面试时使用的交互通道。 */
export type AgentInterviewMode = "text" | "voice";

/** 面试难度等级。 */
export type AgentDifficulty = "初级" | "中级" | "高级";

/** Agent 可进入的受控业务阶段。 */
export type AgentPhase =
  | "preparing"
  | "awaiting_answer"
  | "reasoning"
  | "speaking"
  | "scoring"
  | "role_handoff"
  | "reporting"
  | "completed"
  | "failed";

/** 面试官角色标识。 */
export type RoleId = "general" | "technical" | "manager" | "hr";

/** Graph 完成当前节点后计划执行的受控动作。 */
export type AgentPendingAction =
  | "ask"
  | "follow_up"
  | "score"
  | "handoff"
  | "finish";

/** Agent 使用的模型供应商名称。 */
export type AgentModelProvider = "deepseek" | "openai" | "anthropic";

/**
 * 创建会话时冻结的业务配置。
 *
 * 该结构只保存可审计配置，不允许加入 API Key、Authorization、Token 或数据库凭据。
 */
export type FrozenAgentConfig = Readonly<{
  /** 文本或语音面试通道。 */
  interviewMode: AgentInterviewMode;
  /** 用户选择的目标岗位。 */
  position: string;
  /** 本场面试的难度。 */
  difficulty: AgentDifficulty;
  /** 本场面试需要完成的题目总数。 */
  questionCount: number;
  /** 岗位需求描述；创建时未提供则为 null。 */
  jobDescription: string | null;
  /** 目标公司；创建时未提供则为 null。 */
  targetCompany: string | null;
  /** 使用的 Skill 标识；未选择则为 null。 */
  skillId: string | null;
  /** 使用的简历记录标识；未选择则为 null。 */
  resumeId: string | null;
  /** 已解析的模型供应商。 */
  modelProvider: AgentModelProvider;
  /** 已解析的模型名称。 */
  modelName: string;
  /** 是否允许在面试准备阶段执行联网研究。 */
  webResearch: boolean;
  /** 构建本场面试所使用的 Prompt 版本。 */
  promptVersion: string;
}>;

/** 固定角色接力中的一个阶段。 */
export type RoleStage = {
  /** 阶段在角色计划中的零基索引。 */
  stageIndex: number;
  /** 该阶段使用的面试官角色。 */
  roleId: RoleId;
  /** 该角色负责的题目数量。 */
  questionCount: number;
  /** 该阶段第一题在全场题目中的零基索引。 */
  startQuestionIndex: number;
  /** 该阶段最后一题在全场题目中的零基索引。 */
  endQuestionIndex: number;
};

/** 控制角色提问边界和风格的 Persona。 */
export type RolePersona = {
  /** Persona 对应的稳定角色标识。 */
  id: RoleId;
  /** 前端展示的角色名称。 */
  displayName: string;
  /** 该角色在面试中需要达成的目标。 */
  goals: string[];
  /** 该角色生成问题时使用的语气约束。 */
  tone: string;
  /** 该角色允许覆盖的主题范围。 */
  allowedTopics: string[];
  /** 无论模型输出如何都必须禁止的行为。 */
  prohibitedBehaviors: string[];
  /** 该角色对冻结量表维度的权重覆盖。 */
  rubricOverrides: Record<string, number>;
  /** Persona Prompt 的版本标识。 */
  promptVersion: string;
};

/** 可由 LangGraph Checkpoint 恢复的最小面试状态。 */
export type InterviewAgentState = {
  /** Agent 状态契约版本。 */
  version: AgentVersion;
  /** 业务会话标识，同时作为 LangGraph thread_id。 */
  sessionId: string;
  /** 会话所有者标识，仅供服务端鉴权和恢复使用。 */
  userId: string;
  /** 单面试官或多角色面板模式。 */
  mode: AgentMode;
  /** 当前业务阶段。 */
  phase: AgentPhase;
  /** 创建时冻结且后续不可由输入覆盖的配置。 */
  config: FrozenAgentConfig;
  /** 本场面试固定的角色及题数计划。 */
  rolePlan: RoleStage[];
  /** 当前负责提问的角色。 */
  currentRole: RoleId;
  /** 当前题目标识；准备阶段尚无题目时为 null。 */
  currentQuestionId: string | null;
  /** 当前题目在全场中的零基索引。 */
  currentQuestionIndex: number;
  /** 当前题目已执行的追问次数。 */
  followUpCount: number;
  /** 已覆盖的冻结量表维度键。 */
  coveredDimensions: string[];
  /** 最近一次被 Graph 接受的幂等输入标识。 */
  latestInputId: string | null;
  /** 最近一次证据提取产生的证据标识。 */
  latestEvidenceIds: string[];
  /** Graph 下一步必须执行的受控动作。 */
  pendingAction: AgentPendingAction;
};

/** 返回给客户端的可恢复 Agent 快照。 */
export type AgentSnapshot = {
  /** 业务会话标识。 */
  sessionId: string;
  /** LangGraph 线程标识，v1 与 sessionId 相同。 */
  threadId: string;
  /** Agent 状态契约版本。 */
  version: AgentVersion;
  /** 角色编排模式。 */
  mode: AgentMode;
  /** 文本或语音交互通道。 */
  interviewMode: AgentInterviewMode;
  /** 当前 Agent 阶段。 */
  phase: AgentPhase;
  /** 当前面试官角色。 */
  currentRole: RoleId;
  /** 当前题目标识；准备阶段为 null。 */
  currentQuestionId: string | null;
  /** 当前题目的零基索引。 */
  currentQuestionIndex: number;
  /** 当前题目的追问次数。 */
  followUpCount: number;
  /** 下一步受控动作。 */
  pendingAction: AgentPendingAction;
  /** 已提交事件的最后序号。 */
  eventCursor: number;
};

/** SSE 中展示的最小 Agent 消息。 */
export type AgentMessageView = {
  /** 消息标识。 */
  id: string;
  /** 消息发送方。 */
  role: "user" | "assistant";
  /** 已完成的消息文本。 */
  content: string;
  /** 消息所属面试官角色。 */
  roleId: RoleId;
  /** ISO 8601 创建时间。 */
  createdAt: string;
  /** 消息是否在生成或播放过程中被打断。 */
  interrupted: boolean;
};

/** 会话完成事件的最小数据。 */
export type AgentSessionCompletedData = {
  /** 已完成的业务会话标识。 */
  sessionId: string;
  /** ISO 8601 完成时间。 */
  completedAt: string;
};

/** 可安全返回给客户端的 Agent 错误。 */
export type AgentError = {
  /** 可供客户端分支处理的稳定错误码。 */
  code: string;
  /** 不含敏感模型报文或凭据的用户可读信息。 */
  message: string;
  /** 客户端是否可以提交 retry 请求。 */
  retryable: boolean;
};

/** 带数据库事件序号的统一事件信封。 */
export type AgentEventEnvelope<TType extends string, TData> = {
  /** 会话内严格递增的事件序号。 */
  sequence: number;
  /** 可用于 SSE event 字段的稳定事件类型。 */
  type: TType;
  /** 与事件类型对应的结构化载荷。 */
  data: TData;
  /** 数据库提交事件时生成的 ISO 8601 时间。 */
  createdAt?: string;
};

/** Phase 1 可提交和重放的最小 Agent 事件集合。 */
export type AgentEvent =
  | AgentEventEnvelope<"agent.snapshot", AgentSnapshot>
  | AgentEventEnvelope<"agent.phase", { phase: AgentPhase }>
  | AgentEventEnvelope<"agent.role_changed", RoleStage>
  | AgentEventEnvelope<"agent.message_completed", AgentMessageView>
  | AgentEventEnvelope<"agent.session_completed", AgentSessionCompletedData>
  | AgentEventEnvelope<"agent.error", AgentError>;

/** Phase 1 支持的 Agent 事件类型。 */
export type AgentEventType = AgentEvent["type"];

/** 创建 Agent 会话的 HTTP 请求体。 */
export type CreateAgentSessionBody = {
  /** 单面试官或多角色面板模式。 */
  mode: AgentMode;
  /** 文本或语音面试通道。 */
  interviewMode: AgentInterviewMode;
  /** 目标岗位。 */
  position: string;
  /** 面试难度。 */
  difficulty: AgentDifficulty;
  /** 本场题目总数，必须为 3–10。 */
  questionCount: number;
  /** 可选岗位需求描述。 */
  jobDescription?: string;
  /** 可选目标公司。 */
  targetCompany?: string;
  /** 可选 Skill 标识。 */
  skillId?: string;
  /** 可选简历记录标识。 */
  resumeId?: string;
  /** 可选模型供应商；服务端缺省时从用户设置解析。 */
  modelProvider?: AgentModelProvider;
  /** 可选模型名称；服务端必须校验供应商兼容性。 */
  modelName?: string;
  /** 是否允许在准备阶段联网研究。 */
  webResearch?: boolean;
};

/** Agent 会话路径参数。 */
export type AgentSessionParams = {
  /** 需要访问的业务会话 UUID。 */
  sessionId: string;
};

/** 向等待中的 Agent 提交文本回答的请求体。 */
export type AgentTextInputBody = {
  /** 客户端生成的稳定幂等标识；语音接入后直接使用 turnId。 */
  inputId: string;
  /** v1 文本输入判别字段。 */
  type: "text";
  /** 用户提交的回答文本。 */
  content: string;
};

/** 打断当前输出的请求体。 */
export type InterruptAgentSessionBody = {
  /** 可选操作幂等标识。 */
  operationId?: string;
  /** 可选语音轮次标识；文本输出打断时可省略。 */
  turnId?: string;
  /** 打断来源，缺省为用户主动操作。 */
  reason?: "user_requested" | "barge_in";
};

/** 主动结束面试的请求体。 */
export type FinishAgentSessionBody = {
  /** 可选操作幂等标识。 */
  operationId?: string;
};

/** 重试失败 Agent 操作的请求体。 */
export type RetryAgentSessionBody = {
  /** 可选操作幂等标识。 */
  operationId?: string;
  /** 是否允许服务端重新执行已标记失败的节点。 */
  force?: boolean;
};

/** 创建 Agent 会话后的 HTTP 202 响应。 */
export type CreateAgentSessionResponse = {
  /** 新建业务会话标识。 */
  sessionId: string;
  /** LangGraph 线程标识。 */
  threadId: string;
  /** 创建后初始阶段。 */
  phase: "preparing";
  /** 创建事务提交的最后事件序号。 */
  eventCursor: number;
};

/** 带幂等元数据的 Agent 操作结果。 */
export type AgentOperationResult<TResult> = {
  /** 是否命中了之前完成的相同操作。 */
  duplicate: boolean;
  /** 服务端生成的确定性操作键。 */
  operationKey: string;
  /** 本次操作产生的首个事件序号；无事件时为 null。 */
  firstEventSequence: number | null;
  /** 本次操作产生的最后事件序号；无事件时为 null。 */
  lastEventSequence: number | null;
  /** 首次执行或幂等重放得到的业务结果。 */
  result: TResult;
};

/** GET Agent 会话与 input/interrupt/retry 共用的当前视图。 */
export type AgentSessionView = {
  /** 数据库最后一次提交的 Agent 快照。 */
  snapshot: AgentSnapshot;
};

/** 文本输入恢复 Graph 后的响应。 */
export type AgentInputResponse = AgentSessionView & {
  /** 是否直接返回相同 inputId 第一次提交的结果。 */
  duplicate: boolean;
  /** 与 inputId 一一对应的数据库幂等操作键。 */
  operationKey: string;
};

/** Phase 1 尚无活动流式输出时的打断确认。 */
export type AgentInterruptResponse = AgentSessionView & {
  /** 是否实际取消了模型或语音输出。 */
  accepted: boolean;
  /** 未取消时供客户端解释状态的稳定原因。 */
  reason?: "no_active_output";
};

/** 重试准备节点后的当前视图。 */
export type AgentRetryResponse = AgentSessionView & {
  /** 是否命中此前已经完成的相同准备操作。 */
  duplicate: boolean;
};
