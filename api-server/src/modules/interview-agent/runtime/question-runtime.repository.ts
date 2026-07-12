/** Interview Agent Phase 3 冻结计划读取、题目历史与后续题原子提交 Repository。 */
import { z } from "zod";
import type { UserSupabaseClient } from "../../../shared/db/supabase.js";
import { FrozenAgentConfigSchema, RoleStageSchema } from "../interview-agent.schemas.js";
import type {
  CommitRuntimeQuestionInput,
  RuntimeQuestionContext,
  RuntimeQuestionReceipt,
} from "./question-runtime.types.js";

/** 选题业务服务依赖的运行时持久化端口。 */
export interface QuestionRuntimeRepository {
  /** 读取冻结计划与历史题目。 */
  loadContext(sessionId: string): Promise<RuntimeQuestionContext>;
  /** 原子提交后续题。 */
  commitQuestion(input: CommitRuntimeQuestionInput): Promise<RuntimeQuestionReceipt>;
}

/** Runtime Repository 使用的最小查询能力。 */
export interface QuestionRuntimeDatabaseQuery extends PromiseLike<unknown> {
  /** 选择明确列。 */
  select(columns: string): QuestionRuntimeDatabaseQuery;
  /** 添加等值过滤。 */
  eq(column: string, value: unknown): QuestionRuntimeDatabaseQuery;
  /** 稳定排序。 */
  order(column: string, options: { ascending: boolean }): QuestionRuntimeDatabaseQuery;
  /** 要求恰好一行。 */
  single(): QuestionRuntimeDatabaseQuery;
}

/** Supabase 与测试 fake 共用的数据库端口。 */
export interface QuestionRuntimeDatabaseClient {
  /** 构造会话或题目查询。 */
  from(table: "interview_sessions" | "interview_questions"): QuestionRuntimeDatabaseQuery;
  /** 调用后续题原子提交 RPC。 */
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<unknown>;
}

const ResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() }).passthrough();
const DimensionSchema = z.object({
  key: z.string().min(1).max(100), label: z.string().min(1).max(200),
  source: z.enum(["universal", "skill", "role"]), weight: z.number().positive(),
  targetQuestionCount: z.number().int().min(0).max(10), evidenceHints: z.array(z.string().max(200)).max(20),
}).strict();
const ResearchSchema = z.object({
  category: z.enum(["company", "role", "industry"]), query: z.string(), title: z.string(),
  url: z.string(), snippet: z.string(), fetchedAt: z.string(), contentHash: z.string(),
}).strict();
const CandidateSchema = z.object({
  id: z.string(), question: z.string(), position: z.string(), difficulty: z.enum(["初级", "中级", "高级"]),
  type: z.string(), tags: z.array(z.string()), source: z.enum(["bank", "model"]),
}).strict();
const PlanSchema = z.object({
  version: z.literal("plan-v1"),
  rolePlan: z.array(RoleStageSchema).min(1).max(3),
  capabilityBlueprint: z.object({
    version: z.literal("capability-v1"), questionCount: z.number().int().min(3).max(10),
    dimensions: z.array(DimensionSchema).min(1).max(50),
  }).strict(),
  questionRoles: z.array(z.enum(["general", "technical", "manager", "hr"])).min(3).max(10),
  questionDimensions: z.array(z.string().min(1).max(100)).min(3).max(10),
  firstQuestion: CandidateSchema,
  researchStatus: z.enum(["completed", "skipped", "failed"]),
  researchSources: z.array(ResearchSchema).max(15),
}).strict();
const SessionRowSchema = z.object({ agent_config: z.unknown(), agent_plan: z.unknown() }).strict();
const QuestionRowSchema = z.object({
  id: z.string().uuid(), question: z.string(), order_index: z.number().int().min(0).max(9),
  dimension_key: z.string().min(1).max(100), bank_question_id: z.string().uuid().nullable(),
}).strict();
const ReceiptSchema: z.ZodType<RuntimeQuestionReceipt> = z.object({
  committed: z.boolean(), duplicate: z.boolean(), operationKey: z.string(), questionId: z.string().uuid(),
  orderIndex: z.number().int().min(1).max(9), roleId: z.enum(["general", "technical", "manager", "hr"]),
  dimensionKey: z.string().min(1).max(100), eventSequence: z.number().int().positive(),
}).strict();

/** 隐藏 PostgREST 原始错误与异常消息。 */
async function execute(operation: PromiseLike<unknown>): Promise<unknown> {
  let raw: unknown;
  try { raw = await operation; } catch { throw new Error("Agent question runtime is unavailable"); }
  const response = ResponseSchema.safeParse(raw);
  if (!response.success || response.data.error !== null) throw new Error("Agent question runtime is unavailable");
  return response.data.data;
}

/** 用户作用域的后续题 Runtime Repository。 */
export class SupabaseQuestionRuntimeRepository implements QuestionRuntimeRepository {
  /** @param database - 当前用户 Supabase client。 */
  constructor(private readonly database: QuestionRuntimeDatabaseClient) {}

  /**
   * 读取冻结配置/计划与已用题目；不读取回答、评分或研究正文之外的数据。
   *
   * @param sessionId - Agent 会话 UUID。
   * @returns 动态选题所需有限上下文。
   */
  async loadContext(sessionId: string): Promise<RuntimeQuestionContext> {
    const [sessionRaw, questionsRaw] = await Promise.all([
      execute(this.database.from("interview_sessions").select("agent_config, agent_plan").eq("id", sessionId).single()),
      execute(this.database.from("interview_questions").select("id, question, order_index, dimension_key, bank_question_id").eq("session_id", sessionId).order("order_index", { ascending: true })),
    ]);
    const session = SessionRowSchema.parse(sessionRaw);
    return {
      config: FrozenAgentConfigSchema.parse(session.agent_config),
      plan: PlanSchema.parse(session.agent_plan),
      questions: z.array(QuestionRowSchema).parse(questionsRaw).map((row) => ({
        id: row.id, question: row.question, orderIndex: row.order_index,
        dimensionKey: row.dimension_key, bankQuestionId: row.bank_question_id,
      })),
    };
  }

  /** @inheritdoc */
  async commitQuestion(input: CommitRuntimeQuestionInput): Promise<RuntimeQuestionReceipt> {
    return ReceiptSchema.parse(await execute(this.database.rpc("commit_agent_next_question", {
      p_session_id: input.sessionId,
      p_question: {
        id: input.id, orderIndex: input.orderIndex, question: input.question, roleId: input.roleId,
        dimensionKey: input.dimensionKey, source: input.source, bankQuestionId: input.bankQuestionId,
      },
    })));
  }
}

/** 为用户 Supabase client 创建 Runtime Repository。 */
export function createQuestionRuntimeRepository(supabase: UserSupabaseClient) {
  return new SupabaseQuestionRuntimeRepository(supabase as unknown as QuestionRuntimeDatabaseClient);
}
