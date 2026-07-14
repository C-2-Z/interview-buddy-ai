/** Agent 工作台 Repository：按会话所有权读取显式列并组装只读投影。 */
import { z } from "zod";
import type { UserSupabaseClient } from "../../../shared/db/supabase.js";
import type { AgentWorkspace, AgentWorkspaceQuestion } from "./workspace.types.js";

/** 工作台查询所需的最小 Supabase builder。 */
export interface WorkspaceQuery extends PromiseLike<unknown> {
  /** 显式选择字段。 */ select(columns: string): WorkspaceQuery;
  /** 等值过滤。 */ eq(column: string, value: unknown): WorkspaceQuery;
  /** IN 过滤。 */ in(column: string, values: string[]): WorkspaceQuery;
  /** 稳定排序。 */ order(column: string, options: { ascending: boolean }): WorkspaceQuery;
  /** 单行读取。 */ single(): WorkspaceQuery;
}

/** Supabase 与测试 fake 的工作台端口。 */
export interface WorkspaceDatabaseClient {
  /** 构造只读查询。 */
  from(table: "interview_sessions" | "interview_questions" | "interview_messages" | "agent_research_sources" | "answer_evidence" | "question_evaluations"): WorkspaceQuery;
}

const ResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() }).passthrough();
const SessionSchema = z.object({
  status: z.enum(["in_progress","paused","completed","abandoned","failed"]),
  position: z.string(), difficulty: z.string(), research_status: z.enum(["pending","running","completed","skipped","failed"]),
  agent_config: z.object({ questionCount: z.number().int(), targetCompany: z.string().nullable() }).passthrough(),
  overall_score: z.number().int().nullable(), overall_feedback: z.string().nullable(), dimension_summary: z.unknown().nullable(), report_status: z.string(),
}).strict();
const QuestionSchema = z.object({
  id:z.string().uuid(),question:z.string(),order_index:z.number().int(),role_id:z.enum(["general","technical","manager","hr"]),dimension_key:z.string(),selection_source:z.enum(["bank","model"]),score:z.number().int().nullable(),feedback:z.string().nullable(),
}).strict();
const MessageSchema = z.object({ id:z.string().uuid(),question_id:z.string().uuid(),role:z.enum(["user","assistant"]),content:z.string(),source:z.enum(["text","voice"]),interrupted:z.boolean(),created_at:z.string() }).strict();
const SourceSchema = z.object({ id:z.string().uuid(),category:z.enum(["company","role","industry"]),title:z.string(),url:z.string() }).strict();
const EvidenceSchema = z.object({ id:z.string().uuid(),question_id:z.string().uuid(),dimension_key:z.string(),claim:z.string(),quote:z.string() }).strict();
const EvaluationSchema = z.object({ question_id:z.string().uuid(),overall_score:z.number().int().min(0).max(100),dimensions:z.record(z.object({score:z.number().int().min(0).max(100),rationale:z.string(),evidenceIds:z.array(z.string().uuid())}).passthrough()),status:z.literal("completed") }).strict();

/** 执行查询并隐藏数据库原始错误。 */
async function execute(operation: PromiseLike<unknown>): Promise<unknown> {
  const response = ResponseSchema.safeParse(await operation);
  if (!response.success || response.data.error !== null) {
    throw new Error("Agent workspace persistence is unavailable");
  }
  return response.data.data;
}

/** 用户作用域工作台 Repository。 */
export class AgentWorkspaceRepository {
  /** @param database - 携带用户 JWT 且启用 RLS 的数据库端口。 */
  constructor(private readonly database: WorkspaceDatabaseClient) {}

  /**
   * 查询会话显式列，再按题目 ID 批量读取消息、证据和评分，避免跨用户 join 泄漏。
   *
   * @param sessionId - Agent 会话 UUID。
   * @returns 不含 Prompt、Key 或 checkpoint 的页面投影。
   */
  async load(sessionId: string): Promise<Omit<AgentWorkspace, "snapshot" | "strategy" | "activities">> {
    const [sessionRaw, questionsRaw, sourcesRaw] = await Promise.all([
      execute(this.database.from("interview_sessions").select("position, difficulty, status, research_status, agent_config, overall_score, overall_feedback, dimension_summary, report_status").eq("id",sessionId).single()),
      execute(this.database.from("interview_questions").select("id, question, order_index, role_id, dimension_key, selection_source, score, feedback").eq("session_id",sessionId).order("order_index",{ascending:true})),
      execute(this.database.from("agent_research_sources").select("id, category, title, url").eq("session_id",sessionId).order("created_at",{ascending:true})),
    ]);
    const session=SessionSchema.parse(sessionRaw);
    const questions=z.array(QuestionSchema).parse(questionsRaw);
    const questionIds=questions.map((question)=>question.id);
    const [messagesRaw,evidenceRaw,evaluationsRaw]=questionIds.length===0
      ? [[],[],[]]
      : await Promise.all([
          execute(this.database.from("interview_messages").select("id, question_id, role, content, source, interrupted, created_at").in("question_id",questionIds).order("created_at",{ascending:true})),
          execute(this.database.from("answer_evidence").select("id, question_id, dimension_key, claim, quote").eq("session_id",sessionId).order("created_at",{ascending:true})),
          execute(this.database.from("question_evaluations").select("question_id, overall_score, dimensions, status").eq("session_id",sessionId).eq("status","completed").order("created_at",{ascending:true})),
        ]);
    const messages=z.array(MessageSchema).parse(messagesRaw);
    const evidence=z.array(EvidenceSchema).parse(evidenceRaw);
    const evaluations=new Map(z.array(EvaluationSchema).parse(evaluationsRaw).map((item)=>[item.question_id,item]));
    const mappedQuestions:AgentWorkspaceQuestion[]=questions.map((question)=>{
      const evaluation=evaluations.get(question.id);
      return {
        id:question.id,question:question.question,orderIndex:question.order_index,roleId:question.role_id,dimensionKey:question.dimension_key,source:question.selection_source,score:question.score,feedback:question.feedback,
        messages:messages.filter((message)=>message.question_id===question.id).map((message)=>({id:message.id,role:message.role,content:message.content,source:message.source,interrupted:message.interrupted,createdAt:message.created_at})),
        evidence:evidence.filter((item)=>item.question_id===question.id).map((item)=>({id:item.id,dimensionKey:item.dimension_key,claim:item.claim,quote:item.quote})),
        evaluation:evaluation?{overallScore:evaluation.overall_score,dimensions:evaluation.dimensions}:null,
      };
    });
    return {
      productStatus:session.status,
      config:{position:session.position,difficulty:session.difficulty,questionCount:session.agent_config.questionCount,targetCompany:session.agent_config.targetCompany},
      research:{status:session.research_status,sources:z.array(SourceSchema).parse(sourcesRaw)},
      questions:mappedQuestions,
      report:session.report_status==="ready"&&session.overall_score!==null&&session.overall_feedback!==null
        ?{overallScore:session.overall_score,overallFeedback:session.overall_feedback,dimensionSummary:session.dimension_summary}
        :null,
    };
  }
}

/** 创建用户作用域工作台 Repository。 */
export function createAgentWorkspaceRepository(supabase:UserSupabaseClient):AgentWorkspaceRepository{
  return new AgentWorkspaceRepository(supabase as unknown as WorkspaceDatabaseClient);
}
