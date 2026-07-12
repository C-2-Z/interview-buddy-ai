/** Interview Agent Phase 4 冻结评分上下文读取与原子评分提交 Repository。 */
import { z } from "zod";
import type { UserSupabaseClient } from "../../../shared/db/supabase.js";
import { FrozenAgentConfigSchema } from "../interview-agent.schemas.js";
import type {
  CommitQuestionEvaluationInput,
  QuestionEvaluationContext,
  QuestionEvaluationReceipt,
} from "./evaluation.types.js";
import type { AgentEvaluationRepository } from "./evaluation.service.js";

/** Evaluation Repository 使用的最小查询能力。 */
export interface EvaluationDatabaseQuery extends PromiseLike<unknown> {
  /** 选择明确列。 */ select(columns: string): EvaluationDatabaseQuery;
  /** 等值过滤。 */ eq(column: string, value: unknown): EvaluationDatabaseQuery;
  /** 稳定排序。 */ order(column: string, options: { ascending: boolean }): EvaluationDatabaseQuery;
  /** 单行。 */ single(): EvaluationDatabaseQuery;
}

/** Supabase 与测试 fake 的评分数据库端口。 */
export interface EvaluationDatabaseClient {
  /** 构造会话、题目或消息查询。 */
  from(table: "interview_sessions" | "interview_questions" | "interview_messages"): EvaluationDatabaseQuery;
  /** 调用评分原子 RPC。 */
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<unknown>;
}

const ResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() }).passthrough();
const SessionSchema = z.object({ agent_config: z.unknown(), agent_plan: z.object({
  capabilityBlueprint: z.object({ dimensions: z.array(z.object({
    key: z.string().min(1).max(100), label: z.string().min(1).max(200), weight: z.number().positive(),
  }).passthrough()).min(1).max(50) }).passthrough(),
}).passthrough() }).strict();
const QuestionSchema = z.object({ id: z.string().uuid(), question: z.string().min(1).max(5_000) }).strict();
const MessageSchema = z.object({ id: z.string().uuid(), content: z.string().max(20_000) }).strict();
const ReceiptSchema: z.ZodType<QuestionEvaluationReceipt> = z.object({
  committed: z.boolean(), duplicate: z.boolean(), operationKey: z.string(), questionId: z.string().uuid(),
  overallScore: z.number().int().min(0).max(100), eventSequence: z.number().int().positive(),
  evidenceIds: z.array(z.string().uuid()).max(50),
}).strict();

/** 执行数据库操作并隐藏底层错误内容。 */
async function execute(operation: PromiseLike<unknown>): Promise<unknown> {
  let raw: unknown;
  try { raw = await operation; } catch { throw new Error("Agent evaluation persistence is unavailable"); }
  const response = ResponseSchema.safeParse(raw);
  if (!response.success || response.data.error !== null) throw new Error("Agent evaluation persistence is unavailable");
  return response.data.data;
}

/** 用户作用域的评分 Repository。 */
export class SupabaseAgentEvaluationRepository implements AgentEvaluationRepository {
  /** @param database - 携带当前用户 JWT 的数据库 client。 */
  constructor(private readonly database: EvaluationDatabaseClient) {}

  /** @inheritdoc */
  async loadContext(sessionId: string, questionId: string): Promise<QuestionEvaluationContext> {
    const [sessionRaw, questionRaw, messagesRaw] = await Promise.all([
      execute(this.database.from("interview_sessions").select("agent_config, agent_plan").eq("id", sessionId).single()),
      execute(this.database.from("interview_questions").select("id, question").eq("id", questionId).eq("session_id", sessionId).single()),
      execute(this.database.from("interview_messages").select("id, content").eq("question_id", questionId).eq("role", "user").order("sequence", { ascending: true })),
    ]);
    const session = SessionSchema.parse(sessionRaw);
    const config = FrozenAgentConfigSchema.parse(session.agent_config);
    const question = QuestionSchema.parse(questionRaw);
    return {
      sessionId,
      questionId: question.id,
      question: question.question,
      promptVersion: config.promptVersion,
      modelProvider: config.modelProvider,
      modelName: config.modelName,
      rubricVersion: "rubric-v1",
      rubric: session.agent_plan.capabilityBlueprint.dimensions.map((dimension) => ({
        key: dimension.key, label: dimension.label, weight: dimension.weight,
      })),
      messages: z.array(MessageSchema).parse(messagesRaw),
    };
  }

  /** @inheritdoc */
  async commitEvaluation(input: CommitQuestionEvaluationInput): Promise<QuestionEvaluationReceipt> {
    return ReceiptSchema.parse(await execute(this.database.rpc("commit_agent_question_evaluation", {
      p_session_id: input.context.sessionId,
      p_question_id: input.context.questionId,
      p_evidence: input.evidence,
      p_evaluation: input.evaluation,
    })));
  }

  /** @inheritdoc */
  async markEvaluationFailed(sessionId: string, questionId: string): Promise<void> {
    await execute(this.database.rpc("mark_agent_evaluation_failed", {
      p_session_id: sessionId,
      p_question_id: questionId,
    }));
  }
}

/** 创建用户作用域评分 Repository。 */
export function createAgentEvaluationRepository(supabase: UserSupabaseClient): AgentEvaluationRepository {
  return new SupabaseAgentEvaluationRepository(supabase as unknown as EvaluationDatabaseClient);
}
