/** Interview Agent 持久化接口、Supabase RPC 实现与数据库边界运行时校验。 */
import { z, type ZodType } from "zod";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import {
  CreateAgentSessionSchema,
  type CreateAgentSessionInput,
} from "./interview-agent.schemas.js";
import type {
  AgentEvent,
  AgentPhase,
  AgentSnapshot,
  CreateAgentSessionResponse,
  RoleId,
} from "./interview-agent.types.js";
import type { AgentEventReader } from "./events/agent-event-stream.js";

/** Repository 允许跨 RPC 和事件边界传递的 JSON 标量。 */
export type SafeAgentJsonPrimitive = string | number | boolean | null;

/** Repository 允许持久化的递归 JSON 值；不包含 undefined、类实例或循环引用。 */
export type SafeAgentJsonValue =
  | SafeAgentJsonPrimitive
  | SafeAgentJsonObject
  | SafeAgentJsonValue[];

/** Repository 允许持久化且已经检查敏感键的 JSON 对象。 */
export type SafeAgentJsonObject = {
  /** 任意业务字段都必须继续满足安全 JSON 约束。 */
  [key: string]: SafeAgentJsonValue;
};

/** 由用户作用域 Supabase client 读取的无凭据 Agent 会话投影。 */
export type AgentSessionProjection = {
  /** 业务会话 UUID。 */
  sessionId: string;
  /** 会话所有者 UUID，用于恢复 Graph 状态时绑定鉴权身份。 */
  userId: string;
  /** LangGraph thread_id。 */
  threadId: string;
  /** 当前持久化契约版本。 */
  version: "agent-v1";
  /** 单角色或固定阶段面板模式。 */
  mode: "single" | "panel";
  /** 文本或语音交互通道。 */
  interviewMode: "text" | "voice";
  /** 当前已提交业务阶段。 */
  phase: AgentPhase;
  /** 当前负责面试的角色。 */
  currentRole: RoleId;
  /** 创建会话时冻结且已确认不含凭据的 Agent 配置。 */
  agentConfig: SafeAgentJsonObject;
  /** 准备阶段联网研究的持久化状态。 */
  researchStatus: "pending" | "running" | "completed" | "skipped" | "failed";
  /** 最后一个已提交事件序号。 */
  eventCursor: number;
};

/** claim RPC 返回的幂等操作状态。 */
export type AgentOperationClaim = {
  /** true 表示本次请求取得执行权。 */
  claimed: boolean;
  /** true 表示命中已完成操作并返回原结果。 */
  duplicate: boolean;
  /** true 表示相同操作当前正在由其他执行者处理。 */
  inProgress: boolean;
  /** 数据库中的受控操作状态。 */
  status: "pending" | "running" | "completed";
  /** 会话内确定性的幂等键。 */
  operationKey: string;
  /** 执行该操作的 Graph 节点名。 */
  nodeName: string;
  /** 已完成重复操作的安全结果；未完成时为 null。 */
  result: SafeAgentJsonObject | null;
  /** 已完成操作首个事件序号；未完成时为 null。 */
  firstEventSequence: number | null;
  /** 已完成操作最后事件序号；未完成时为 null。 */
  lastEventSequence: number | null;
};

/** commit RPC 返回的原子提交结果。 */
export type AgentOperationCommit = {
  /** true 表示本次调用写入了投影、事件和幂等账本。 */
  committed: boolean;
  /** true 表示返回的是第一次提交的结果。 */
  duplicate: boolean;
  /** commit 已结束时恒为 false。 */
  inProgress: false;
  /** commit 成功或重放时恒为 completed。 */
  status: "completed";
  /** 会话内确定性的幂等键。 */
  operationKey: string;
  /** 完成提交的 Graph 节点名。 */
  nodeName: string;
  /** 首次提交保存并经安全 JSON 校验的结果。 */
  result: SafeAgentJsonObject;
  /** 本操作首个已提交事件序号。 */
  firstEventSequence: number;
  /** 本操作最后一个已提交事件序号。 */
  lastEventSequence: number;
};

/** fail RPC 新写入的失败状态。 */
export type AgentOperationFailed = {
  /** 本次调用是否把操作标记为失败。 */
  failed: true;
  /** 新失败记录不是幂等完成重放。 */
  duplicate: false;
  /** 失败分支的受控状态。 */
  status: "failed";
  /** 会话内确定性的幂等键。 */
  operationKey: string;
  /** 可审计但不含原始异常文本的稳定错误码。 */
  errorCode: string;
};

/** fail RPC 命中已完成操作时返回的原提交。 */
export type AgentOperationFailureReplay = {
  /** 已完成操作不会被覆盖为失败。 */
  failed: false;
  /** true 表示返回第一次提交的结果。 */
  duplicate: true;
  /** 原操作保持 completed。 */
  status: "completed";
  /** 会话内确定性的幂等键。 */
  operationKey: string;
  /** 第一次提交保存并经安全 JSON 校验的结果。 */
  result: SafeAgentJsonObject;
  /** 第一次提交的首个事件序号。 */
  firstEventSequence: number;
  /** 第一次提交的最后事件序号。 */
  lastEventSequence: number;
};

/** fail RPC 的完整判别联合。 */
export type AgentOperationFailure =
  | AgentOperationFailed
  | AgentOperationFailureReplay;

/** 从完整事件中移除数据库负责生成的提交元数据。 */
export type AgentEventDraft = AgentEvent extends infer TEvent
  ? TEvent extends AgentEvent
    ? Omit<TEvent, "sequence" | "createdAt">
    : never
  : never;

/** claim 操作所需的稳定参数。 */
export type ClaimAgentOperationInput = {
  /** 当前用户拥有的 Agent 会话 UUID。 */
  sessionId: string;
  /** 会话内确定性的幂等键。 */
  operationKey: string;
  /** 即将执行的 Graph 节点名。 */
  nodeName: string;
};

/** 原子提交投影、业务结果和客户端事件所需参数。 */
export type CommitAgentOperationInput = ClaimAgentOperationInput & {
  /** 提交后的业务阶段。 */
  phase: AgentPhase;
  /** 提交后的当前角色。 */
  currentRole: RoleId;
  /** 节点业务结果；Repository 会深拷贝并拒绝任何敏感键。 */
  result: Readonly<Record<string, unknown>>;
  /** 本次事务需要按给定顺序写入的事件。 */
  events: readonly AgentEventDraft[];
};

/** 标记操作失败所需的脱敏参数。 */
export type FailAgentOperationInput = {
  /** 当前用户拥有的 Agent 会话 UUID。 */
  sessionId: string;
  /** 会话内确定性的幂等键。 */
  operationKey: string;
  /** 不含模型原文或异常消息的稳定错误码。 */
  errorCode: string;
};

/** Repository 创建 RPC 需要的服务端增强参数，promptVersion 不允许由 HTTP 客户端提交。 */
export type CreateAgentSessionRepositoryInput = CreateAgentSessionInput & {
  /** 服务端当前启用的 Prompt 契约版本。 */
  promptVersion: string;
};

/** Repository 对外暴露的稳定、安全错误码。 */
export type InterviewAgentRepositoryErrorCode =
  | "agent_repository_invalid_input"
  | "agent_session_not_found"
  | "agent_operation_conflict"
  | "agent_repository_forbidden"
  | "agent_repository_unavailable"
  | "agent_repository_invalid_output";

/** 不暴露 SQL、表名、数据库消息或凭据的 Repository 模块错误。 */
export class InterviewAgentRepositoryError extends Error {
  /** 客户端和上层 service 可安全分支处理的稳定错误码。 */
  readonly code: InterviewAgentRepositoryErrorCode;

  /** 建议 HTTP adapter 使用的状态码。 */
  readonly statusCode: number;

  /** 上层是否可以安全重试同一个幂等操作。 */
  readonly retryable: boolean;

  /**
   * 创建不携带数据库原始错误详情的模块错误。
   *
   * @param code - 稳定模块错误码。
   * @param message - 固定且可安全展示的消息。
   * @param statusCode - 建议 HTTP 状态码。
   * @param retryable - 是否适合按相同幂等键重试。
   */
  constructor(
    code: InterviewAgentRepositoryErrorCode,
    message: string,
    statusCode: number,
    retryable: boolean,
  ) {
    super(message);
    this.name = "InterviewAgentRepositoryError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/** Supabase/PostgREST 查询链在本模块实际使用的最小能力。 */
export interface AgentDatabaseQuery extends PromiseLike<unknown> {
  /** 选择显式无凭据列。 */
  select(columns: string): AgentDatabaseQuery;
  /** 添加相等过滤条件。 */
  eq(column: string, value: unknown): AgentDatabaseQuery;
  /** 添加严格大于游标的过滤条件。 */
  gt(column: string, value: number): AgentDatabaseQuery;
  /** 指定数据库端稳定排序。 */
  order(column: string, options: { ascending: boolean }): AgentDatabaseQuery;
  /** 限制单页记录数。 */
  limit(count: number): AgentDatabaseQuery;
  /** 要求返回唯一记录。 */
  single(): AgentDatabaseQuery;
}

/** 可由真实 Supabase client 或测试 fake 实现的窄数据库端口。 */
export interface AgentDatabaseClient {
  /** 调用迁移中声明的原子 RPC。 */
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<unknown>;
  /** 构造 Agent 会话或事件的只读查询。 */
  from(table: "interview_sessions" | "agent_events"): AgentDatabaseQuery;
}

/** Interview Agent 业务层依赖的完整持久化端口。 */
export interface InterviewAgentRepository extends AgentEventReader {
  /** 创建会话、初始快照和 create 幂等记录。 */
  createSession(
    input: CreateAgentSessionRepositoryInput,
  ): Promise<CreateAgentSessionResponse>;
  /** 读取当前用户拥有的无凭据会话投影。 */
  getOwnedSessionProjection(sessionId: string): Promise<AgentSessionProjection>;
  /** 在执行 Graph 节点前声明幂等操作。 */
  claimOperation(input: ClaimAgentOperationInput): Promise<AgentOperationClaim>;
  /** 原子提交投影、结果和有序事件。 */
  commitOperation(input: CommitAgentOperationInput): Promise<AgentOperationCommit>;
  /** 使用稳定错误码标记未完成操作失败。 */
  failOperation(input: FailAgentOperationInput): Promise<AgentOperationFailure>;
}

const SafeIntegerSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);
const PositiveSafeIntegerSchema = SafeIntegerSchema.min(1);
const AgentPhaseSchema = z.enum([
  "preparing",
  "awaiting_answer",
  "reasoning",
  "speaking",
  "scoring",
  "role_handoff",
  "reporting",
  "completed",
  "failed",
]);
const RoleIdSchema = z.enum(["general", "technical", "manager", "hr"]);
const AgentEventTypeSchema = z.enum([
  "agent.snapshot",
  "agent.phase",
  "agent.role_changed",
  "agent.question_ready",
  "agent.message_completed",
  "agent.session_completed",
  "agent.error",
]);
const IsoTimestampSchema = z.string().datetime({ offset: true });
const StableKeySchema = z.string().trim().min(1).max(200);
const NodeNameSchema = z.string().trim().min(1).max(100);
const SessionIdSchema = z.string().uuid();
const ErrorCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9_.-]*$/);

const DatabaseErrorSchema = z
  .object({
    code: z.string().optional(),
  })
  .passthrough();
const DatabaseResponseSchema = z
  .object({
    data: z.unknown(),
    error: DatabaseErrorSchema.nullable(),
  })
  .passthrough();

const CreateSessionResultSchema = z
  .object({
    sessionId: SessionIdSchema,
    threadId: z.string().trim().min(1).max(200),
    phase: z.literal("preparing"),
    eventCursor: PositiveSafeIntegerSchema,
  })
  .strict();

const SessionProjectionRowSchema = z
  .object({
    id: SessionIdSchema,
    user_id: SessionIdSchema,
    thread_id: z.string().trim().min(1).max(200),
    agent_version: z.literal("agent-v1"),
    agent_mode: z.enum(["single", "panel"]),
    interview_mode: z.enum(["text", "voice"]),
    agent_phase: AgentPhaseSchema,
    current_role: RoleIdSchema,
    agent_config: z.unknown(),
    research_status: z.enum([
      "pending",
      "running",
      "completed",
      "skipped",
      "failed",
    ]),
    last_event_seq: SafeIntegerSchema,
  })
  .strict();

const ClaimResultSchema = z
  .object({
    claimed: z.boolean(),
    duplicate: z.boolean(),
    inProgress: z.boolean(),
    status: z.enum(["pending", "running", "completed"]),
    operationKey: StableKeySchema,
    nodeName: NodeNameSchema,
    result: z.unknown().nullable(),
    firstEventSequence: PositiveSafeIntegerSchema.nullable(),
    lastEventSequence: PositiveSafeIntegerSchema.nullable(),
  })
  .strict();

const CommitResultSchema = z
  .object({
    committed: z.boolean(),
    duplicate: z.boolean(),
    inProgress: z.literal(false),
    status: z.literal("completed"),
    operationKey: StableKeySchema,
    nodeName: NodeNameSchema,
    result: z.unknown(),
    firstEventSequence: PositiveSafeIntegerSchema,
    lastEventSequence: PositiveSafeIntegerSchema,
  })
  .strict();

const FailedResultSchema = z
  .object({
    failed: z.literal(true),
    duplicate: z.literal(false),
    status: z.literal("failed"),
    operationKey: StableKeySchema,
    errorCode: ErrorCodeSchema,
  })
  .strict();
const FailureReplayResultSchema = z
  .object({
    failed: z.literal(false),
    duplicate: z.literal(true),
    status: z.literal("completed"),
    operationKey: StableKeySchema,
    result: z.unknown(),
    firstEventSequence: PositiveSafeIntegerSchema,
    lastEventSequence: PositiveSafeIntegerSchema,
  })
  .strict();
const FailureResultSchema = z.discriminatedUnion("status", [
  FailedResultSchema,
  FailureReplayResultSchema,
]);

const EventRowSchema = z
  .object({
    sequence: PositiveSafeIntegerSchema,
    type: AgentEventTypeSchema,
    payload: z.unknown(),
    created_at: IsoTimestampSchema,
  })
  .strict();
const EventDraftSchema = z
  .object({
    type: AgentEventTypeSchema,
    data: z.unknown(),
  })
  .strict();

const AgentSnapshotDataSchema: ZodType<AgentSnapshot> = z.object({
  sessionId: SessionIdSchema,
  threadId: z.string().trim().min(1).max(200),
  version: z.literal("agent-v1"),
  mode: z.enum(["single", "panel"]),
  interviewMode: z.enum(["text", "voice"]),
  phase: AgentPhaseSchema,
  currentRole: RoleIdSchema,
  currentQuestionId: z.string().trim().min(1).max(200).nullable(),
  currentQuestionIndex: SafeIntegerSchema,
  followUpCount: SafeIntegerSchema,
  pendingAction: z.enum(["ask", "follow_up", "score", "handoff", "finish"]),
  eventCursor: SafeIntegerSchema,
});
const AgentPhaseDataSchema = z
  .object({
    phase: AgentPhaseSchema,
  })
  .strict();
const RoleStageDataSchema = z
  .object({
    stageIndex: SafeIntegerSchema,
    roleId: RoleIdSchema,
    questionCount: PositiveSafeIntegerSchema,
    startQuestionIndex: SafeIntegerSchema,
    endQuestionIndex: SafeIntegerSchema,
  })
  .strict()
  .refine((stage) => stage.startQuestionIndex <= stage.endQuestionIndex);
const QuestionReadyDataSchema = z
  .object({
    id: SessionIdSchema,
    question: z.string().trim().min(1).max(5_000),
    orderIndex: SafeIntegerSchema,
    roleId: RoleIdSchema,
    dimensionKey: z.string().trim().min(1).max(100),
    source: z.enum(["bank", "model"]),
  })
  .strict();
const MessageCompletedDataSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    role: z.enum(["user", "assistant"]),
    content: z.string().max(100_000),
    roleId: RoleIdSchema,
    createdAt: IsoTimestampSchema,
    interrupted: z.boolean(),
  })
  .strict();
const SessionCompletedDataSchema = z
  .object({
    sessionId: SessionIdSchema,
    completedAt: IsoTimestampSchema,
  })
  .strict();
const AgentErrorDataSchema = z
  .object({
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(1_000),
    retryable: z.boolean(),
  })
  .strict();

const ClaimInputSchema = z
  .object({
    sessionId: SessionIdSchema,
    operationKey: StableKeySchema,
    nodeName: NodeNameSchema,
  })
  .strict();
const CommitInputHeaderSchema = ClaimInputSchema.extend({
  phase: AgentPhaseSchema,
  currentRole: RoleIdSchema,
});
const FailInputSchema = z
  .object({
    sessionId: SessionIdSchema,
    operationKey: StableKeySchema,
    errorCode: ErrorCodeSchema,
  })
  .strict();
const CreateSessionRepositoryInputSchema = CreateAgentSessionSchema.extend({
  promptVersion: z.string().trim().min(1).max(100),
});

const MAX_SAFE_JSON_DEPTH = 32;
const MAX_SAFE_JSON_NODES = 10_000;

type JsonValidationSource = "input" | "database";

/** 创建固定的无数据库细节输入错误。 */
function invalidInputError(): InterviewAgentRepositoryError {
  return new InterviewAgentRepositoryError(
    "agent_repository_invalid_input",
    "The Agent persistence request is invalid.",
    400,
    false,
  );
}

/** 创建固定的无原始行内容输出错误。 */
function invalidOutputError(): InterviewAgentRepositoryError {
  return new InterviewAgentRepositoryError(
    "agent_repository_invalid_output",
    "Agent persistence returned an invalid response.",
    500,
    false,
  );
}

/**
 * 将输入或数据库边界的校验失败映射为固定模块错误。
 *
 * @param source - 数据来自调用者还是数据库。
 * @returns 不携带原始值的模块错误。
 */
function jsonValidationError(
  source: JsonValidationSource,
): InterviewAgentRepositoryError {
  return source === "input" ? invalidInputError() : invalidOutputError();
}

/**
 * 复刻数据库约束的敏感键归一化规则，避免凭据进入结果、事件或恢复配置。
 *
 * @param key - JSON 对象中的原始字段名。
 * @returns 是否属于凭据或认证字段。
 */
function isSensitiveJsonKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    normalized === "key" ||
    normalized === "token" ||
    normalized === "bearer" ||
    normalized === "credential" ||
    normalized === "credentials" ||
    /(apikey|accesstoken|refreshtoken|authtoken|authorization|secretkey|privatekey|signingkey|secret|password|databaseurl|credentials?)$/.test(
      normalized,
    )
  );
}

/**
 * 递归复制一个 JSON 值，同时拒绝循环引用、访问器、类实例、稀疏数组和敏感键。
 *
 * @param value - 尚未信任的输入或数据库 JSON。
 * @param source - 用于选择安全的模块错误类别。
 * @param depth - 当前递归深度。
 * @param state - 递归祖先和节点配额。
 * @returns 与输入脱离引用的安全 JSON 值。
 */
function cloneSafeJsonValue(
  value: unknown,
  source: JsonValidationSource,
  depth: number,
  state: { ancestors: Set<object>; nodes: number },
): SafeAgentJsonValue {
  state.nodes += 1;
  if (depth > MAX_SAFE_JSON_DEPTH || state.nodes > MAX_SAFE_JSON_NODES) {
    throw jsonValidationError(source);
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw jsonValidationError(source);
    return value;
  }
  if (typeof value !== "object") throw jsonValidationError(source);

  if (state.ancestors.has(value)) throw jsonValidationError(source);
  state.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value);
      if (
        ownKeys.some(
          (key) =>
            typeof key !== "string" ||
            key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key),
        )
      ) {
        throw jsonValidationError(source);
      }

      const cloned: SafeAgentJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw jsonValidationError(source);
        }
        cloned.push(cloneSafeJsonValue(value[index], source, depth + 1, state));
      }
      return cloned;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw jsonValidationError(source);
    }

    const cloned: SafeAgentJsonObject = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || isSensitiveJsonKey(key)) {
        throw jsonValidationError(source);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw jsonValidationError(source);
      }
      cloned[key] = cloneSafeJsonValue(
        descriptor.value,
        source,
        depth + 1,
        state,
      );
    }
    return cloned;
  } finally {
    state.ancestors.delete(value);
  }
}

/**
 * 校验并深拷贝必须为对象的安全 JSON。
 *
 * @param value - RPC result、事件 data 或冻结配置。
 * @param source - 数据来自调用者还是数据库。
 * @returns 不含敏感键的普通 JSON 对象。
 */
function cloneSafeJsonObject(
  value: unknown,
  source: JsonValidationSource,
): SafeAgentJsonObject {
  const cloned = cloneSafeJsonValue(value, source, 0, {
    ancestors: new Set<object>(),
    nodes: 0,
  });
  if (cloned === null || Array.isArray(cloned) || typeof cloned !== "object") {
    throw jsonValidationError(source);
  }
  return cloned;
}

/**
 * 使用 Zod 校验调用者参数，并隐藏具体输入值和字段内容。
 *
 * @param schema - 当前操作的输入契约。
 * @param value - 未信任的调用者参数。
 * @returns 已校验且规范化的参数。
 */
function parseRepositoryInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidInputError();
  return parsed.data;
}

/**
 * 使用 Zod 校验数据库数据，并阻止原始数据库响应进入模块异常。
 *
 * @param schema - RPC 或查询结果契约。
 * @param value - 未信任的数据库数据。
 * @returns 已校验数据。
 */
function parseDatabaseOutput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidOutputError();
  return parsed.data;
}

/**
 * 根据稳定 Postgres/PostgREST code 映射错误，不读取或透传数据库 message/details/hint。
 *
 * @param error - Supabase 返回或底层 promise 抛出的错误。
 * @returns 不含数据库实现细节的模块错误。
 */
function mapDatabaseError(error: unknown): InterviewAgentRepositoryError {
  if (error instanceof InterviewAgentRepositoryError) return error;
  const parsed = DatabaseErrorSchema.safeParse(error);
  const code = parsed.success ? parsed.data.code : undefined;

  if (code === "P0002" || code === "PGRST116") {
    return new InterviewAgentRepositoryError(
      "agent_session_not_found",
      "The Agent session was not found.",
      404,
      false,
    );
  }
  if (code === "23505") {
    return new InterviewAgentRepositoryError(
      "agent_operation_conflict",
      "The Agent operation conflicts with an existing operation.",
      409,
      false,
    );
  }
  if (code === "22023") return invalidInputError();
  if (code === "28000" || code === "42501") {
    return new InterviewAgentRepositoryError(
      "agent_repository_forbidden",
      "The Agent persistence operation is not permitted.",
      403,
      false,
    );
  }
  return new InterviewAgentRepositoryError(
    "agent_repository_unavailable",
    "Agent persistence is temporarily unavailable.",
    503,
    true,
  );
}

/**
 * 执行一次 Supabase 操作并统一校验响应信封和错误映射。
 *
 * @param execute - 延迟执行的 RPC 或查询。
 * @returns 未经业务 schema 解析的 data 字段。
 */
async function executeDatabaseOperation(
  execute: () => PromiseLike<unknown>,
): Promise<unknown> {
  let response: unknown;
  try {
    response = await execute();
  } catch (error) {
    throw mapDatabaseError(error);
  }

  const envelope = DatabaseResponseSchema.safeParse(response);
  if (!envelope.success) throw invalidOutputError();
  if (envelope.data.error !== null) throw mapDatabaseError(envelope.data.error);
  return envelope.data.data;
}

/**
 * 将安全事件 data 投影到 Phase 1 事件契约，未知字段不会离开 Repository。
 *
 * @param type - 已由事件类型 schema 校验的类型。
 * @param data - 已完成敏感键和 JSON 结构检查的对象。
 * @param source - 用于选择固定输入或输出错误。
 * @returns 与事件类型匹配的公开 data。
 */
function parseEventData(
  type: AgentEvent["type"],
  data: SafeAgentJsonObject,
  source: JsonValidationSource,
): AgentEvent["data"] {
  const schema = (() => {
    switch (type) {
      case "agent.snapshot":
        return AgentSnapshotDataSchema;
      case "agent.phase":
        return AgentPhaseDataSchema;
      case "agent.role_changed":
        return RoleStageDataSchema;
      case "agent.question_ready":
        return QuestionReadyDataSchema;
      case "agent.message_completed":
        return MessageCompletedDataSchema;
      case "agent.session_completed":
        return SessionCompletedDataSchema;
      case "agent.error":
        return AgentErrorDataSchema;
    }
  })();
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw jsonValidationError(source);
  return parsed.data;
}

/**
 * 将数据库 event row 转换为只包含公开字段的强类型事件。
 *
 * @param value - agent_events 查询返回的单行。
 * @returns 已校验并脱离数据库原始对象引用的事件。
 */
function parseEventRow(value: unknown): AgentEvent {
  const row = parseDatabaseOutput(EventRowSchema, value);
  const safePayload = cloneSafeJsonObject(row.payload, "database");
  const createdAt = row.created_at;

  // 分支构造保留 type 与 data 的判别联合关系，避免未经校验的类型断言。
  switch (row.type) {
    case "agent.snapshot":
      return {
        sequence: row.sequence,
        type: row.type,
        data: parseDatabaseOutput(AgentSnapshotDataSchema, safePayload),
        createdAt,
      };
    case "agent.phase":
      return {
        sequence: row.sequence,
        type: row.type,
        data: parseDatabaseOutput(AgentPhaseDataSchema, safePayload),
        createdAt,
      };
    case "agent.role_changed":
      return {
        sequence: row.sequence,
        type: row.type,
        data: parseDatabaseOutput(RoleStageDataSchema, safePayload),
        createdAt,
      };
    case "agent.question_ready":
      return {
        sequence: row.sequence,
        type: row.type,
        data: parseDatabaseOutput(QuestionReadyDataSchema, safePayload),
        createdAt,
      };
    case "agent.message_completed":
      return {
        sequence: row.sequence,
        type: row.type,
        data: parseDatabaseOutput(MessageCompletedDataSchema, safePayload),
        createdAt,
      };
    case "agent.session_completed":
      return {
        sequence: row.sequence,
        type: row.type,
        data: parseDatabaseOutput(SessionCompletedDataSchema, safePayload),
        createdAt,
      };
    case "agent.error":
      return {
        sequence: row.sequence,
        type: row.type,
        data: parseDatabaseOutput(AgentErrorDataSchema, safePayload),
        createdAt,
      };
  }
}

/**
 * 把 Graph 事件草稿转换为 RPC 只接受的 type/data 安全对象。
 *
 * @param value - 尚未持久化、没有 sequence 的事件。
 * @returns 严格仅含 type 和 data 的 JSON 对象。
 */
function serializeEventDraft(value: AgentEventDraft): SafeAgentJsonObject {
  const envelope = parseRepositoryInput(EventDraftSchema, value);
  const safeData = cloneSafeJsonObject(envelope.data, "input");
  const projectedData = parseEventData(envelope.type, safeData, "input");
  return {
    type: envelope.type,
    data: cloneSafeJsonObject(projectedData, "input"),
  };
}

/**
 * 把 create schema 输出构造成显式 allowlist payload，避免 undefined 或额外字段进入 RPC。
 *
 * @param input - 已通过创建会话 schema 的参数。
 * @returns 仅含迁移 create RPC 支持字段的安全 JSON 对象。
 */
function serializeCreateSessionInput(
  input: CreateAgentSessionRepositoryInput,
): SafeAgentJsonObject {
  const payload: Record<string, unknown> = {
    mode: input.mode,
    interviewMode: input.interviewMode,
    position: input.position,
    difficulty: input.difficulty,
    questionCount: input.questionCount,
    webResearch: input.webResearch,
    promptVersion: input.promptVersion,
  };
  if (input.jobDescription !== undefined) payload.jobDescription = input.jobDescription;
  if (input.targetCompany !== undefined) payload.targetCompany = input.targetCompany;
  if (input.skillId !== undefined) payload.skillId = input.skillId;
  if (input.resumeId !== undefined) payload.resumeId = input.resumeId;
  if (input.modelProvider !== undefined) payload.modelProvider = input.modelProvider;
  if (input.modelName !== undefined) payload.modelName = input.modelName;
  return cloneSafeJsonObject(payload, "input");
}

/**
 * 校验 claim RPC 的状态不变量并安全复制重复结果。
 *
 * @param value - claim RPC 的 data。
 * @returns 可由业务层判别的幂等 claim。
 */
function parseClaimResult(value: unknown): AgentOperationClaim {
  const parsed = parseDatabaseOutput(ClaimResultSchema, value);
  const result =
    parsed.result === null
      ? null
      : cloneSafeJsonObject(parsed.result, "database");
  const hasEventRange =
    parsed.firstEventSequence !== null && parsed.lastEventSequence !== null;
  const eventRangeOrdered =
    !hasEventRange ||
    parsed.firstEventSequence! <= parsed.lastEventSequence!;

  const completedReplay =
    parsed.status === "completed" &&
    parsed.claimed === false &&
    parsed.duplicate === true &&
    parsed.inProgress === false &&
    result !== null &&
    hasEventRange;
  const acquired =
    parsed.status === "running" &&
    parsed.claimed === true &&
    parsed.duplicate === false &&
    parsed.inProgress === false &&
    result === null &&
    parsed.firstEventSequence === null &&
    parsed.lastEventSequence === null;
  const alreadyRunning =
    (parsed.status === "pending" || parsed.status === "running") &&
    parsed.claimed === false &&
    parsed.duplicate === false &&
    parsed.inProgress === true &&
    result === null &&
    parsed.firstEventSequence === null &&
    parsed.lastEventSequence === null;

  if ((!completedReplay && !acquired && !alreadyRunning) || !eventRangeOrdered) {
    throw invalidOutputError();
  }
  return { ...parsed, result };
}

/**
 * 校验 commit RPC 状态不变量并安全复制业务结果。
 *
 * @param value - commit RPC 的 data。
 * @returns 原子提交或幂等重放结果。
 */
function parseCommitResult(value: unknown): AgentOperationCommit {
  const parsed = parseDatabaseOutput(CommitResultSchema, value);
  if (
    parsed.committed === parsed.duplicate ||
    parsed.firstEventSequence > parsed.lastEventSequence
  ) {
    throw invalidOutputError();
  }
  return {
    ...parsed,
    result: cloneSafeJsonObject(parsed.result, "database"),
  };
}

/**
 * 校验 fail RPC 的新失败或已完成重放分支。
 *
 * @param value - fail RPC 的 data。
 * @returns 不含原始异常详情的失败结果。
 */
function parseFailureResult(value: unknown): AgentOperationFailure {
  const parsed = parseDatabaseOutput(FailureResultSchema, value);
  if (parsed.status === "failed") return parsed;
  if (parsed.firstEventSequence > parsed.lastEventSequence) {
    throw invalidOutputError();
  }
  return {
    ...parsed,
    result: cloneSafeJsonObject(parsed.result, "database"),
  };
}

/** Supabase 上的 Interview Agent Repository 实现。 */
export class SupabaseInterviewAgentRepository
  implements InterviewAgentRepository
{
  /**
   * 绑定一个用户作用域数据库端口；真实环境依靠 RLS 保证 owned 查询。
   *
   * @param database - 真实 Supabase client 或测试 fake。
   */
  constructor(private readonly database: AgentDatabaseClient) {}

  /**
   * 通过 create_agent_interview_session 在单事务创建会话、快照和幂等记录。
   *
   * @param input - 已由 HTTP 层产生的创建参数。
   * @returns 新会话和首个已提交事件游标。
   */
  async createSession(
    input: CreateAgentSessionRepositoryInput,
  ): Promise<CreateAgentSessionResponse> {
    const parsedInput = parseRepositoryInput(
      CreateSessionRepositoryInputSchema,
      input,
    );
    const data = await executeDatabaseOperation(() =>
      this.database.rpc("create_agent_interview_session", {
        p_session: serializeCreateSessionInput(parsedInput),
      }),
    );
    return parseDatabaseOutput(CreateSessionResultSchema, data);
  }

  /**
   * 只选择恢复 Graph 所需的无凭据列，并依赖用户 client RLS 验证所有权。
   *
   * @param sessionId - Agent 会话 UUID。
   * @returns 当前已提交的会话投影和冻结配置。
   */
  async getOwnedSessionProjection(
    sessionId: string,
  ): Promise<AgentSessionProjection> {
    const parsedSessionId = parseRepositoryInput(SessionIdSchema, sessionId);
    const data = await executeDatabaseOperation(() =>
      this.database
        .from("interview_sessions")
        .select(
          "id, user_id, thread_id, agent_version, agent_mode, interview_mode, agent_phase, current_role, agent_config, research_status, last_event_seq",
        )
        .eq("id", parsedSessionId)
        .eq("agent_version", "agent-v1")
        .single(),
    );
    const row = parseDatabaseOutput(SessionProjectionRowSchema, data);
    return {
      sessionId: row.id,
      userId: row.user_id,
      threadId: row.thread_id,
      version: row.agent_version,
      mode: row.agent_mode,
      interviewMode: row.interview_mode,
      phase: row.agent_phase,
      currentRole: row.current_role,
      agentConfig: cloneSafeJsonObject(row.agent_config, "database"),
      researchStatus: row.research_status,
      eventCursor: row.last_event_seq,
    };
  }

  /**
   * 在 Graph 节点执行前调用 claim_agent_operation，识别取得执行权、进行中或已完成重放。
   *
   * @param input - 会话、幂等键和节点名。
   * @returns 经状态不变量校验的 claim 结果。
   */
  async claimOperation(
    input: ClaimAgentOperationInput,
  ): Promise<AgentOperationClaim> {
    const parsed = parseRepositoryInput(ClaimInputSchema, input);
    const data = await executeDatabaseOperation(() =>
      this.database.rpc("claim_agent_operation", {
        p_session_id: parsed.sessionId,
        p_operation_key: parsed.operationKey,
        p_node_name: parsed.nodeName,
      }),
    );
    return parseClaimResult(data);
  }

  /**
   * 通过 commit_agent_operation 原子提交投影、幂等结果和一批有序客户端事件。
   *
   * @param input - claim 元数据、提交后投影、业务结果和事件草稿。
   * @returns 首次提交或第一次提交的幂等重放。
   */
  async commitOperation(
    input: CommitAgentOperationInput,
  ): Promise<AgentOperationCommit> {
    // 只把 header 字段交给 strict schema；result/events 分别走递归安全 JSON 校验。
    const parsed = parseRepositoryInput(CommitInputHeaderSchema, {
      sessionId: input.sessionId,
      operationKey: input.operationKey,
      nodeName: input.nodeName,
      phase: input.phase,
      currentRole: input.currentRole,
    });
    if (!Array.isArray(input.events) || input.events.length < 1 || input.events.length > 50) {
      throw invalidInputError();
    }
    const result = cloneSafeJsonObject(input.result, "input");
    const events = input.events.map((event) => serializeEventDraft(event));
    const data = await executeDatabaseOperation(() =>
      this.database.rpc("commit_agent_operation", {
        p_session_id: parsed.sessionId,
        p_operation_key: parsed.operationKey,
        p_node_name: parsed.nodeName,
        p_agent_phase: parsed.phase,
        p_current_role: parsed.currentRole,
        p_result: result,
        p_events: events,
      }),
    );
    return parseCommitResult(data);
  }

  /**
   * 通过 fail_agent_operation 只保存稳定错误码，不保存原始异常文本。
   *
   * @param input - 会话、幂等键和脱敏错误码。
   * @returns 新失败状态或已完成操作的原结果。
   */
  async failOperation(
    input: FailAgentOperationInput,
  ): Promise<AgentOperationFailure> {
    const parsed = parseRepositoryInput(FailInputSchema, input);
    const data = await executeDatabaseOperation(() =>
      this.database.rpc("fail_agent_operation", {
        p_session_id: parsed.sessionId,
        p_operation_key: parsed.operationKey,
        p_error_code: parsed.errorCode,
      }),
    );
    return parseFailureResult(data);
  }

  /**
   * 按 sequence 升序分页读取游标之后已经提交的 Agent 事件。
   *
   * @param sessionId - 当前用户拥有的 Agent 会话 UUID。
   * @param afterSequence - 客户端已确认的最后事件序号。
   * @param limit - 单页最大记录数，范围 1–250。
   * @returns 二次排序且完成 payload 投影的事件。
   */
  async listEventsAfter(
    sessionId: string,
    afterSequence: number,
    limit: number,
  ): Promise<AgentEvent[]> {
    const parsedSessionId = parseRepositoryInput(SessionIdSchema, sessionId);
    const parsedAfter = parseRepositoryInput(SafeIntegerSchema, afterSequence);
    const parsedLimit = parseRepositoryInput(
      z.number().int().min(1).max(250),
      limit,
    );
    const data = await executeDatabaseOperation(() =>
      this.database
        .from("agent_events")
        .select("sequence, type, payload, created_at")
        .eq("session_id", parsedSessionId)
        .gt("sequence", parsedAfter)
        .order("sequence", { ascending: true })
        .limit(parsedLimit),
    );
    const rows = parseDatabaseOutput(z.array(z.unknown()).max(parsedLimit), data);
    return rows
      .map((row) => parseEventRow(row))
      .sort((left, right) => left.sequence - right.sequence);
  }

  /**
   * 读取 sequence 最大的已提交 agent.snapshot，供 SSE 初连和缺口恢复使用。
   *
   * @param sessionId - 当前用户拥有的 Agent 会话 UUID。
   * @returns 最新已提交快照事件。
   */
  async getLatestSnapshotEvent(sessionId: string): Promise<AgentEvent> {
    const parsedSessionId = parseRepositoryInput(SessionIdSchema, sessionId);
    const data = await executeDatabaseOperation(() =>
      this.database
        .from("agent_events")
        .select("sequence, type, payload, created_at")
        .eq("session_id", parsedSessionId)
        .eq("type", "agent.snapshot")
        .order("sequence", { ascending: false })
        .limit(1)
        .single(),
    );
    const event = parseEventRow(data);
    if (event.type !== "agent.snapshot") throw invalidOutputError();
    return event;
  }
}

/**
 * 从项目的用户作用域 Supabase client 创建生产 Repository。
 *
 * 生成的 Database 类型尚未包含同一变更集新增的 RPC/表，因此只在此边界收窄为迁移已保证的端口，
 * 不修改或伪造全局 generated types。
 *
 * @param supabase - 已携带当前用户 JWT 的 Supabase client。
 * @returns 可注入 service 和 SSE 的 Repository。
 */
export function createInterviewAgentRepository(
  supabase: UserSupabaseClient,
): InterviewAgentRepository {
  return new SupabaseInterviewAgentRepository(
    supabase as unknown as AgentDatabaseClient,
  );
}
