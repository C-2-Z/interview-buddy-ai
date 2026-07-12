/** Interview Agent Phase 4 冻结评分报告读取与原子完成提交 Repository。 */
import { z } from "zod";
import type { UserSupabaseClient } from "../../../shared/db/supabase.js";
import type { AgentReportRepository } from "./report.service.js";
import type { AgentReportContext, AgentReportReceipt, FrozenAgentReport } from "./report.types.js";

/** 报告查询使用的最小 Supabase 能力。 */
export interface ReportDatabaseQuery extends PromiseLike<unknown> {
  /** 选择明确列。 */ select(columns: string): ReportDatabaseQuery;
  /** 等值过滤。 */ eq(column: string, value: unknown): ReportDatabaseQuery;
  /** 排序。 */ order(column: string, options: { ascending: boolean }): ReportDatabaseQuery;
  /** 单行。 */ single(): ReportDatabaseQuery;
}

/** Supabase 与测试 fake 的报告数据库端口。 */
export interface ReportDatabaseClient {
  /** 构造会话、题目、评分或来源查询。 */
  from(table: "interview_sessions" | "interview_questions" | "question_evaluations" | "agent_research_sources"): ReportDatabaseQuery;
  /** 调用报告 RPC。 */ rpc(functionName: string, args: Record<string, unknown>): PromiseLike<unknown>;
}

const ResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() }).passthrough();
const SessionSchema = z.object({ agent_config: z.object({ questionCount: z.number().int().min(3).max(10) }).passthrough(), agent_plan: z.object({ capabilityBlueprint: z.object({ dimensions: z.array(z.object({ key: z.string(), label: z.string(), weight: z.number().positive() }).passthrough()).min(1) }).passthrough() }).passthrough() }).strict();
const QuestionSchema = z.object({ id: z.string().uuid(), order_index: z.number().int(), role_id: z.enum(["general","technical","manager","hr"]), score: z.number().int().min(0).max(100) }).strict();
const EvaluationSchema = z.object({ question_id: z.string().uuid(), overall_score: z.number().int().min(0).max(100), dimensions: z.record(z.object({ score: z.number().int().min(0).max(100) }).passthrough()) }).strict();
const ReceiptSchema: z.ZodType<AgentReportReceipt> = z.object({ committed:z.boolean(),duplicate:z.boolean(),operationKey:z.literal("finalize:report"),sessionId:z.string().uuid(),overallScore:z.number().int().min(0).max(100),eventSequence:z.number().int().positive() }).strict();

/** 执行查询并隐藏数据库原始错误。 */
async function execute(operation: PromiseLike<unknown>): Promise<unknown> {
  let raw: unknown; try { raw=await operation; } catch { throw new Error("Agent report persistence is unavailable"); }
  const response=ResponseSchema.safeParse(raw);
  if(!response.success||response.data.error!==null) throw new Error("Agent report persistence is unavailable");
  return response.data.data;
}

/** 用户作用域冻结报告 Repository。 */
export class SupabaseAgentReportRepository implements AgentReportRepository {
  /** @param database - 当前用户数据库 client。 */ constructor(private readonly database: ReportDatabaseClient) {}

  /** @inheritdoc */
  async loadContext(sessionId: string): Promise<AgentReportContext> {
    const [sessionRaw,questionsRaw,evaluationsRaw,sourcesRaw]=await Promise.all([
      execute(this.database.from("interview_sessions").select("agent_config, agent_plan").eq("id",sessionId).single()),
      execute(this.database.from("interview_questions").select("id, order_index, role_id, score").eq("session_id",sessionId).order("order_index",{ascending:true})),
      execute(this.database.from("question_evaluations").select("question_id, overall_score, dimensions").eq("session_id",sessionId).eq("status","completed").order("created_at",{ascending:true})),
      execute(this.database.from("agent_research_sources").select("id").eq("session_id",sessionId)),
    ]);
    const session=SessionSchema.parse(sessionRaw);
    const questions=z.array(QuestionSchema).parse(questionsRaw);
    const evaluations=new Map(z.array(EvaluationSchema).parse(evaluationsRaw).map((item)=>[item.question_id,item]));
    return {
      sessionId,
      questionCount:session.agent_config.questionCount,
      rubric:session.agent_plan.capabilityBlueprint.dimensions.map((item)=>({key:item.key,label:item.label,weight:item.weight})),
      questions:questions.map((question)=>{
        const evaluation=evaluations.get(question.id);
        if(!evaluation) throw new Error("Frozen question evaluation is missing");
        return {questionId:question.id,orderIndex:question.order_index,roleId:question.role_id,overallScore:evaluation.overall_score,dimensions:evaluation.dimensions};
      }),
      researchSourceCount:z.array(z.object({id:z.string().uuid()}).strict()).parse(sourcesRaw).length,
    };
  }

  /** @inheritdoc */
  async commitReport(report: FrozenAgentReport): Promise<AgentReportReceipt> {
    return ReceiptSchema.parse(await execute(this.database.rpc("finalize_agent_report",{p_session_id:report.sessionId,p_report:report})));
  }
}

/** 创建用户作用域报告 Repository。 */
export function createAgentReportRepository(supabase:UserSupabaseClient):AgentReportRepository{
  return new SupabaseAgentReportRepository(supabase as unknown as ReportDatabaseClient);
}
