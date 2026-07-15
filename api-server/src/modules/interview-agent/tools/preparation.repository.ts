/** Interview Agent Phase 2 简历摘要、题库、研究缓存与原子准备提交 Repository。 */
import { z } from "zod";
import type { UserSupabaseClient } from "../../../shared/db/supabase.js";
import type { AgentEventDraft, AgentOperationCommit } from "../interview-agent.repository.js";
import type { AgentDifficulty, RoleId } from "../interview-agent.types.js";
import type {
  AgentQuestionCandidate,
  AgentResearchSource,
  AgentResumeSummary,
  PreparedInterviewPlan,
} from "./preparation.types.js";

/** Supabase 查询构造器在本 Repository 使用的最小只读能力。 */
export interface PreparationDatabaseQuery extends PromiseLike<unknown> {
  /** 选择明确列，避免完整简历文本进入进程。 */
  select(columns: string): PreparationDatabaseQuery;
  /** 添加等值过滤。 */
  eq(column: string, value: unknown): PreparationDatabaseQuery;
  /** 使用稳定字段排序。 */
  order(column: string, options: { ascending: boolean }): PreparationDatabaseQuery;
  /** 限制外部数据规模。 */
  limit(count: number): PreparationDatabaseQuery;
  /** 要求零或一行。 */
  maybeSingle(): PreparationDatabaseQuery;
}

/** 真实 Supabase client 与测试 fake 共同满足的准备阶段数据库端口。 */
export interface PreparationDatabaseClient {
  /** 构造受 RLS 保护的只读查询。 */
  from(
    table:
      | "resumes"
      | "question_bank"
      | "agent_research_sources"
      | "interview_messages",
  ): PreparationDatabaseQuery;
  /** 调用原子准备提交 RPC。 */
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<unknown>;
}

/** 原子提交首题所需的稳定业务字段。 */
export type PreparedQuestionWrite = {
  /** 新生成的业务题目 UUID，与 checkpoint 和事件引用一致。 */
  id: string;
  /** 面试题正文。 */
  question: string;
  /** 首题固定角色。 */
  roleId: RoleId;
  /** 首题主能力维度。 */
  dimensionKey: string;
  /** 选择来源。 */
  source: "bank" | "model";
  /** 题库来源 UUID；模型题为 null。 */
  bankQuestionId: string | null;
};

/** 准备阶段原子提交输入。 */
export type CommitPreparationInput = {
  /** Agent 会话 UUID。 */
  sessionId: string;
  /** 已 claim 的准备幂等键。 */
  operationKey: string;
  /** 固定准备节点名。 */
  nodeName: string;
  /** 提交后的当前角色。 */
  currentRole: RoleId;
  /** 冻结计划。 */
  plan: PreparedInterviewPlan;
  /** 首题持久化投影。 */
  question: PreparedQuestionWrite;
  /** 不含敏感字段的操作结果。 */
  result: Readonly<Record<string, unknown>>;
  /** 按顺序提交的客户端事件。 */
  events: readonly AgentEventDraft[];
};

/** 业务服务只需要的原子准备提交端口，便于内存测试替换数据库。 */
export interface PreparationCommitRepository {
  /** 原子提交准备投影。 */
  commitPreparation(input: CommitPreparationInput): Promise<AgentOperationCommit>;
}

const DatabaseResponseSchema = z.object({
  data: z.unknown(),
  error: z.object({ code: z.string().optional() }).passthrough().nullable(),
}).passthrough();
const ResumeRowSchema = z.object({ id: z.string().uuid(), analysis: z.unknown().nullable() }).strict();
const ResumeAnalysisSchema = z.object({
  skills: z.array(z.string()).optional().default([]),
  workExperience: z.array(z.object({ role: z.string().optional().default("") }).passthrough()).optional().default([]),
  projects: z.array(z.object({
    name: z.string().optional().default(""),
    techStack: z.array(z.string()).optional().default([]),
  }).passthrough()).optional().default([]),
  overallAssessment: z.string().optional().nullable().default(null),
}).passthrough();
const QuestionRowSchema = z.object({
  id: z.string().uuid(),
  position: z.string(),
  difficulty: z.enum(["初级", "中级", "高级"]),
  type: z.string(),
  question: z.string(),
  tags: z.array(z.string()).nullable().optional(),
  role_ids: z.array(z.enum(["general", "technical", "manager", "hr"])).nullable().optional(),
  dimension_keys: z.array(z.string()).nullable().optional(),
  topic_keys: z.array(z.string()).nullable().optional(),
  evidence_goal_keys: z.array(z.string()).nullable().optional(),
}).strict();
const ResearchRowSchema = z.object({
  category: z.enum(["company", "role", "industry"]),
  query: z.string(),
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  fetched_at: z.string(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const CommitResultSchema = z.object({
  committed: z.boolean(),
  duplicate: z.boolean(),
  inProgress: z.literal(false),
  status: z.literal("completed"),
  operationKey: z.string(),
  nodeName: z.string(),
  result: z.record(z.unknown()),
  firstEventSequence: z.number().int().positive(),
  lastEventSequence: z.number().int().positive(),
}).strict();

/** 将数据库错误统一折叠为不泄露底层详情的准备失败。 */
function unwrapDatabaseResponse(value: unknown): unknown {
  const response = DatabaseResponseSchema.safeParse(value);
  if (!response.success || response.data.error) {
    throw new Error("Agent preparation persistence is unavailable");
  }
  return response.data.data;
}

/** 清理有限文本数组并去重，避免历史分析异常膨胀 Prompt。 */
function boundedStrings(values: readonly string[], limit: number, length: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .slice(0, limit)
    .map((value) => value.slice(0, length));
}

/** Phase 2 用户作用域准备 Repository。 */
export class InterviewPreparationRepository implements PreparationCommitRepository {
  /** @param database - 真实用户 Supabase client 或测试 fake。 */
  constructor(private readonly database: PreparationDatabaseClient) {}

  /**
   * 只选择 `analysis`，把用户自有简历投影为有限摘要，绝不读取 `parsed_text`。
   *
   * @param resumeId - 可选简历 UUID。
   * @returns 有分析时的有限摘要，否则为 null。
   */
  async loadResumeSummary(resumeId: string | null): Promise<AgentResumeSummary | null> {
    if (!resumeId) return null;
    const raw = unwrapDatabaseResponse(
      await this.database.from("resumes").select("id, analysis").eq("id", resumeId).maybeSingle(),
    );
    if (raw === null) return null;
    const row = ResumeRowSchema.parse(raw);
    const analysis = ResumeAnalysisSchema.safeParse(row.analysis);
    if (!analysis.success) return null;
    return {
      resumeId: row.id,
      skills: boundedStrings(analysis.data.skills, 50, 100),
      roles: boundedStrings(analysis.data.workExperience.map((item) => item.role), 20, 100),
      projects: boundedStrings(
        analysis.data.projects.map((item) =>
          [item.name, ...item.techStack].filter(Boolean).join(" · "),
        ),
        20,
        200,
      ),
      overallAssessment: analysis.data.overallAssessment?.trim().slice(0, 500) || null,
    };
  }

  /**
   * 先查岗位精确题，再用通用题补足；只选择动态选题需要的公开列。
   *
   * @param input - 岗位、难度和最大候选数。
   * @returns 去重后的题库候选。
   */
  async searchQuestionBank(input: {
    position: string;
    difficulty: AgentDifficulty;
    limit: number;
  }): Promise<AgentQuestionCandidate[]> {
    const limit = Math.max(1, Math.min(50, Math.trunc(input.limit)));
    const load = async (position: string) => {
      const raw = unwrapDatabaseResponse(
        await this.database
          .from("question_bank")
          .select("id, position, difficulty, type, question, tags, role_ids, dimension_keys, topic_keys, evidence_goal_keys")
          .eq("position", position)
          .eq("difficulty", input.difficulty)
          .order("created_at", { ascending: true })
          .limit(limit),
      );
      return z.array(QuestionRowSchema).parse(raw);
    };
    const [specific, general] = await Promise.all([load(input.position), load("通用")]);
    const unique = new Map<string, z.infer<typeof QuestionRowSchema>>();
    for (const row of [...specific, ...general]) unique.set(row.id, row);
    return [...unique.values()].slice(0, limit).map((row) => ({
      id: row.id,
      question: row.question,
      position: row.position,
      difficulty: row.difficulty,
      type: row.type,
      tags: row.tags ?? [],
      roleIds: row.role_ids ?? [],
      dimensionKeys: row.dimension_keys ?? [],
      topicKeys: row.topic_keys ?? [],
      evidenceGoalKeys: row.evidence_goal_keys ?? [],
      source: "bank",
    }));
  }

  /**
   * 按会话读取已清洗研究缓存；RLS 保证只能读取自己的会话来源。
   *
   * @param sessionId - Agent 会话 UUID。
   * @returns 按创建时间稳定排序的研究来源。
   */
  async loadResearchSources(sessionId: string): Promise<AgentResearchSource[]> {
    const raw = unwrapDatabaseResponse(
      await this.database
        .from("agent_research_sources")
        .select("category, query, title, url, snippet, fetched_at, content_hash")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(15),
    );
    return z.array(ResearchRowSchema).parse(raw).map((row) => ({
      category: row.category,
      query: row.query,
      title: row.title,
      url: row.url,
      snippet: row.snippet,
      fetchedAt: row.fetched_at,
      contentHash: row.content_hash,
    }));
  }

  /**
   * 只读取消息 UUID，供 Graph 后续按引用恢复上下文，正文不进入核心 State。
   *
   * @param sessionId - Agent 会话 UUID。
   * @returns 按创建时间排序的消息 UUID。
   */
  async loadSessionMessageIds(sessionId: string): Promise<string[]> {
    const raw = unwrapDatabaseResponse(
      await this.database
        .from("interview_messages")
        .select("id, interview_questions!inner(session_id)")
        .eq("interview_questions.session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(200),
    );
    return z.array(z.object({ id: z.string().uuid() }).strict()).parse(raw).map((row) => row.id);
  }

  /**
   * 通过 definer RPC 原子写入冻结计划、研究、首题、投影和事件。
   *
   * @param input - 已 claim 的准备操作及全部安全投影。
   * @returns 数据库分配事件序号后的提交结果。
   */
  async commitPreparation(input: CommitPreparationInput): Promise<AgentOperationCommit> {
    const raw = unwrapDatabaseResponse(await this.database.rpc("commit_agent_v3_preparation", {
      p_session_id: input.sessionId,
      p_operation_key: input.operationKey,
      p_node_name: input.nodeName,
      p_current_role: input.currentRole,
      p_plan: input.plan,
      p_sources: input.plan.researchSources,
      p_question: input.question,
      p_result: input.result,
      p_events: input.events,
    }));
    return CommitResultSchema.parse(raw) as AgentOperationCommit;
  }
}

/** 为用户作用域 Supabase client 创建准备 Repository。 */
export function createInterviewPreparationRepository(
  supabase: UserSupabaseClient,
): InterviewPreparationRepository {
  return new InterviewPreparationRepository(
    supabase as unknown as PreparationDatabaseClient,
  );
}
