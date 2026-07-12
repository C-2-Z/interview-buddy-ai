/** Interview Agent Phase 3 输入 receipt 原子写入和按 inputId 只读加载 Repository。 */
import { z } from "zod";
import type { UserSupabaseClient } from "../../../shared/db/supabase.js";
import type {
  AgentInputReceipt,
  AgentInterviewerResponseReceipt,
  PersistedAgentInput,
} from "./input.types.js";

/** 输入 Repository 使用的最小 Supabase 查询能力。 */
export interface AgentInputDatabaseQuery extends PromiseLike<unknown> {
  /** 选择消息和当前题目正文的明确列。 */
  select(columns: string): AgentInputDatabaseQuery;
  /** 添加等值过滤。 */
  eq(column: string, value: unknown): AgentInputDatabaseQuery;
  /** 要求恰好一行。 */
  single(): AgentInputDatabaseQuery;
}

/** 真实 Supabase client 与测试 fake 的输入数据库端口。 */
export interface AgentInputDatabaseClient {
  /** 调用原子 receipt RPC。 */
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<unknown>;
  /** 读取受 RLS 保护的已持久化消息。 */
  from(table: "interview_messages"): AgentInputDatabaseQuery;
}

/** 业务服务依赖的输入持久化端口。 */
export interface AgentInputRepository {
  /** 在恢复 Graph 前幂等保存候选人消息。 */
  acceptInput(input: {
    sessionId: string;
    inputId: string;
    content: string;
    source: "text" | "voice";
  }): Promise<AgentInputReceipt>;
  /** Guard/证据节点只按引用加载一条用户消息和题目。 */
  loadInput(sessionId: string, inputId: string): Promise<PersistedAgentInput>;
  /** 幂等保存 Guard redirect 或有效回答追问。 */
  commitInterviewerResponse(input: {
    sessionId: string;
    inputId: string;
    responseType: "redirect" | "follow_up";
    content: string;
  }): Promise<AgentInterviewerResponseReceipt>;
}

/** 输入持久化边界使用的稳定错误，不携带数据库 message/details/hint。 */
export class AgentInputRepositoryError extends Error {
  /** @param code - 稳定模块错误码。 @param statusCode - 建议 HTTP 状态。 @param retryable - 是否可重试。 */
  constructor(
    readonly code: "invalid_input" | "not_found" | "invalid_phase" | "unavailable",
    readonly statusCode: 400 | 404 | 409 | 503,
    readonly retryable: boolean,
  ) {
    super("Agent input persistence failed");
    this.name = "AgentInputRepositoryError";
  }
}

const ResponseSchema = z.object({
  data: z.unknown(),
  error: z.object({ code: z.string().optional() }).passthrough().nullable(),
}).passthrough();
const ReceiptSchema: z.ZodType<AgentInputReceipt> = z.object({
  accepted: z.boolean(),
  duplicate: z.boolean(),
  operationKey: z.string().trim().min(1).max(200),
  messageId: z.string().uuid(),
  questionId: z.string().uuid(),
  eventSequence: z.number().int().positive(),
}).strict();
const ResponseReceiptSchema: z.ZodType<AgentInterviewerResponseReceipt> = z.object({
  committed: z.boolean(),
  duplicate: z.boolean(),
  operationKey: z.string().trim().min(1).max(200),
  messageId: z.string().uuid(),
  questionId: z.string().uuid(),
  responseType: z.enum(["redirect", "follow_up"]),
  followUpCount: z.number().int().min(0).max(3),
  eventSequence: z.number().int().positive(),
}).strict();
const InputRowSchema = z.object({
  id: z.string().uuid(),
  input_id: z.string().trim().min(1).max(180),
  question_id: z.string().uuid(),
  content: z.string().max(20_000),
  source: z.enum(["text", "voice"]),
  created_at: z.string().datetime({ offset: true }),
  interview_questions: z.object({
    session_id: z.string().uuid(),
    question: z.string().min(1).max(5_000),
  }).strict(),
}).strict();

/** 执行 Supabase 操作并隐藏数据库原始错误文本。 */
async function execute(operation: PromiseLike<unknown>): Promise<unknown> {
  let raw: unknown;
  try {
    raw = await operation;
  } catch (error) {
    if (error instanceof AgentInputRepositoryError) throw error;
    throw new Error("Agent input persistence is unavailable");
  }
  const response = ResponseSchema.safeParse(raw);
  if (!response.success) {
    throw new AgentInputRepositoryError("unavailable", 503, true);
  }
  if (response.data.error) {
    switch (response.data.error.code) {
      case "22023":
        throw new AgentInputRepositoryError("invalid_input", 400, false);
      case "P0002":
      case "PGRST116":
        throw new AgentInputRepositoryError("not_found", 404, false);
      case "55000":
        throw new AgentInputRepositoryError("invalid_phase", 409, false);
      default:
        throw new AgentInputRepositoryError("unavailable", 503, true);
    }
  }
  return response.data.data;
}

/** Supabase 实现的用户作用域输入 Repository。 */
export class SupabaseAgentInputRepository implements AgentInputRepository {
  /** @param database - 携带当前用户 JWT 的 Supabase client。 */
  constructor(private readonly database: AgentInputDatabaseClient) {}

  /** @inheritdoc */
  async acceptInput(input: {
    sessionId: string;
    inputId: string;
    content: string;
    source: "text" | "voice";
  }): Promise<AgentInputReceipt> {
    return ReceiptSchema.parse(await execute(this.database.rpc("accept_agent_input", {
      p_session_id: input.sessionId,
      p_input_id: input.inputId,
      p_content: input.content,
      p_source: input.source,
    })));
  }

  /**
   * 通过消息 input_id 和题目 session_id 双重过滤，避免跨会话引用混淆。
   *
   * @param sessionId - 预期 Agent 会话 UUID。
   * @param inputId - Graph State 中唯一保存的输入引用。
   * @returns 仅在节点执行期间存在的回答正文和题目。
   */
  async loadInput(sessionId: string, inputId: string): Promise<PersistedAgentInput> {
    const row = InputRowSchema.parse(await execute(
      this.database
        .from("interview_messages")
        .select("id, input_id, question_id, content, source, created_at, interview_questions!inner(session_id, question)")
        .eq("input_id", inputId)
        .eq("role", "user")
        .eq("interview_questions.session_id", sessionId)
        .single(),
    ));
    return {
      inputId: row.input_id,
      messageId: row.id,
      questionId: row.question_id,
      question: row.interview_questions.question,
      content: row.content,
      source: row.source,
      createdAt: row.created_at,
    };
  }

  /** @inheritdoc */
  async commitInterviewerResponse(input: {
    sessionId: string;
    inputId: string;
    responseType: "redirect" | "follow_up";
    content: string;
  }): Promise<AgentInterviewerResponseReceipt> {
    return ResponseReceiptSchema.parse(await execute(
      this.database.rpc("commit_agent_interviewer_response", {
        p_session_id: input.sessionId,
        p_input_id: input.inputId,
        p_response_type: input.responseType,
        p_content: input.content,
      }),
    ));
  }
}

/** 为用户 Supabase client 创建输入 Repository。 */
export function createAgentInputRepository(
  supabase: UserSupabaseClient,
): AgentInputRepository {
  return new SupabaseAgentInputRepository(
    supabase as unknown as AgentInputDatabaseClient,
  );
}
