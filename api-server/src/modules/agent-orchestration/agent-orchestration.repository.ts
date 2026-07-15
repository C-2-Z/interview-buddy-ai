// @ts-nocheck - Agent 3 增量表与 RPC 将在下一次 Supabase 类型生成后纳入静态数据库类型。
/** Agent Orchestration Repository：持久化策略修订、工具观察和用户可见行动。 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import type { AgentActivity, AgentStrategyDraft, AgentStrategyReceipt, AgentStrategyView } from "./agent-orchestration.types.js";
import type { AgentOptionalToolName } from "./agent-orchestration.types.js";

const StrategyCommitSchema = z.object({ id: z.string().uuid(), revision: z.number().int().positive() }).strict();
const ActivityRowSchema = z.object({
  id: z.string().uuid(), kind: z.enum(["planning", "tool", "reflection", "memory"]),
  status: z.enum(["running", "completed", "skipped", "failed"]), label: z.string(),
  reason_code: z.string().nullable(), source_count: z.number().int().nullable(),
}).passthrough();
const StrategyRowSchema = z.object({
  revision: z.number().int().positive(), objective: z.string(), focus_dimensions: z.array(z.string()),
  memory_applied: z.boolean(), brain_applied: z.boolean(),
}).passthrough();

/** 策略持久化输入。 */
export type CommitStrategyInput = {
  sessionId: string;
  kind: "planning" | "reflection";
  draft: AgentStrategyDraft;
  memoryApplied: boolean;
  brainApplied: boolean;
  /** 本次策略已经完成并持久化的工具观察引用。 */ observationIds: string[];
};

/** 活动写入可附带仅用于审计的有限工具元数据，公共事件不会暴露这些字段。 */
export type AgentActivityWrite = Omit<AgentActivity, "id"> & {
  toolName?: AgentOptionalToolName;
  durationMs?: number;
  resultHash?: string;
  resultSummary?: string;
  /** 限长脱敏后的工具结果正文，仅存业务库，不进入事件或 checkpoint。 */
  resultContext?: string;
};

/** Agent Orchestration 持久化端口。 */
export interface AgentOrchestrationRepository {
  commitStrategy(input: CommitStrategyInput): Promise<{ id: string; revision: number }>;
  recordActivity(
    sessionId: string,
    activity: AgentActivityWrite,
    activityId?: string,
  ): Promise<string>;
  listActivities(sessionId: string): Promise<AgentActivity[]>;
  getLatestStrategy(sessionId: string): Promise<AgentStrategyView | null>;
  /** 首题提交重试时复用最近一次已提交策略和观察，避免重复调用模型或联网。 */
  getLatestStrategyReceipt(sessionId: string): Promise<AgentStrategyReceipt | null>;
  getLatestEvaluation(sessionId: string): Promise<Record<string, { score: number }> | null>;
  /** 临时读取指定工具观察的安全结果上下文。 */
  loadObservationContexts(sessionId: string, observationIds: string[]): Promise<string[]>;
  /** 读取已生成报告的跨题聚合维度；无有效报告时拒绝写入长期记忆。 */
  getReportDimensions(sessionId: string): Promise<Record<string, { score: number }> | null>;
  /** 保存已绑定 Brain 检索产生的有限 chunk 引用。 */
  recordKnowledgeCitations(sessionId: string, citations: Array<{ brainId: string; documentId: string; chunkId: string; title: string; snippet: string; similarity: number }>): Promise<void>;
}

/** Supabase 实现；写入通过迁移 RPC 验证所有权和修订递增。 */
export class SupabaseAgentOrchestrationRepository implements AgentOrchestrationRepository {
  /** @param supabase - 当前用户作用域客户端。 */
  constructor(private readonly supabase: UserSupabaseClient) {}

  /** @inheritdoc */
  async commitStrategy(input: CommitStrategyInput): Promise<{ id: string; revision: number }> {
    const { data, error } = await this.supabase.rpc("commit_agent_v3_strategy_revision", {
      p_session_id: input.sessionId,
      p_strategy: {
        kind: input.kind,
        objective: input.draft.objective,
        focusDimensions: input.draft.focusDimensions,
        questionIntent: input.draft.questionIntent,
        questionCriteria: input.draft.questionCriteria,
        toolRequests: input.draft.toolRequests,
        activityLabel: input.draft.activityLabel,
        memoryApplied: input.memoryApplied,
        brainApplied: input.brainApplied,
        observationIds: input.observationIds,
      },
    });
    if (error) throw new Error("Agent strategy persistence is unavailable");
    return StrategyCommitSchema.parse(data);
  }

  /** @inheritdoc */
  async recordActivity(
    sessionId: string,
    activity: AgentActivityWrite,
    activityId = randomUUID(),
  ): Promise<string> {
    const { error } = await this.supabase.rpc("record_agent_activity", {
      p_session_id: sessionId,
      p_activity: { id: activityId, ...activity },
    });
    if (error) throw new Error("Agent activity persistence is unavailable");
    return activityId;
  }

  /** @inheritdoc */
  async listActivities(sessionId: string): Promise<AgentActivity[]> {
    const { data, error } = await this.supabase
      .from("agent_activities")
      .select("id, kind, status, label, reason_code, source_count")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (error) throw new Error("Agent activity persistence is unavailable");
    return z.array(ActivityRowSchema).parse(data ?? []).map((row) => ({
      id: row.id, kind: row.kind, status: row.status, label: row.label,
      ...(row.reason_code ? { reasonCode: row.reason_code } : {}),
      ...(row.source_count !== null ? { sourceCount: row.source_count } : {}),
    }));
  }

  /** @inheritdoc */
  async getLatestStrategy(sessionId: string): Promise<AgentStrategyView | null> {
    const { data, error } = await this.supabase
      .from("agent_strategy_revisions")
      .select("revision, objective, focus_dimensions, memory_applied, brain_applied")
      .eq("session_id", sessionId)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Agent strategy persistence is unavailable");
    if (!data) return null;
    const row = StrategyRowSchema.parse(data);
    return { revision: row.revision, objective: row.objective, focusDimensions: row.focus_dimensions, memoryApplied: row.memory_applied, brainApplied: row.brain_applied };
  }

  /** @inheritdoc */
  async getLatestStrategyReceipt(sessionId: string): Promise<AgentStrategyReceipt | null> {
    const { data, error } = await this.supabase
      .from("agent_strategy_revisions")
      .select("id, revision, question_intent, question_criteria, observation_ids, memory_applied, brain_applied")
      .eq("session_id", sessionId)
      .eq("kind", "planning")
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Agent strategy persistence is unavailable");
    if (!data) return null;
    const row = z.object({
      id: z.string().uuid(),
      revision: z.number().int().positive(),
      question_intent: z.string().min(1).max(500),
      question_criteria: z.object({
        primaryDimension: z.string().min(1).max(100),
        topicKeys: z.array(z.string().min(1).max(100)).min(1).max(8),
        evidenceGoalKeys: z.array(z.string().min(1).max(100)).min(1).max(8),
        questionIntent: z.string().min(1).max(500),
      }).strict(),
      observation_ids: z.array(z.string().uuid()).max(3),
      memory_applied: z.boolean(),
      brain_applied: z.boolean(),
    }).strict().parse(data);
    return {
      strategyRevisionId: row.id,
      revision: row.revision,
      questionIntent: row.question_intent,
      questionCriteria: row.question_criteria,
      observationIds: row.observation_ids,
      memoryApplied: row.memory_applied,
      brainApplied: row.brain_applied,
    };
  }

  /** @inheritdoc */
  async getLatestEvaluation(sessionId: string): Promise<Record<string, { score: number }> | null> {
    const { data, error } = await this.supabase
      .from("question_evaluations")
      .select("dimensions")
      .eq("session_id", sessionId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Agent evaluation context is unavailable");
    if (!data) return null;
    return z.record(z.object({ score: z.number().int().min(0).max(100) }).passthrough()).parse(data.dimensions);
  }

  /** @inheritdoc */
  async loadObservationContexts(sessionId: string, observationIds: string[]): Promise<string[]> {
    if (observationIds.length === 0) return [];
    const { data, error } = await this.supabase
      .from("agent_tool_runs")
      .select("id, result_context")
      .eq("session_id", sessionId)
      .in("id", observationIds.slice(0, 10));
    if (error) throw new Error("Agent observation context is unavailable");
    return z.array(z.object({
      id: z.string().uuid(),
      result_context: z.string().max(8_000).nullable(),
    }).strict()).parse(data ?? [])
      .flatMap((row) => row.result_context ? [row.result_context] : []);
  }

  /** @inheritdoc */
  async getReportDimensions(sessionId: string): Promise<Record<string, { score: number }> | null> {
    const { data, error } = await this.supabase
      .from("interview_sessions")
      .select("report_status, dimension_summary")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw new Error("Agent report context is unavailable");
    if (!data || data.report_status !== "ready" || data.dimension_summary === null) return null;
    const summary = z.object({
      dimensions: z.record(z.object({ score: z.number().int().min(0).max(100) }).passthrough()),
    }).passthrough().parse(data.dimension_summary);
    return summary.dimensions;
  }

  /** @inheritdoc */
  async recordKnowledgeCitations(sessionId: string, citations: Array<{ brainId: string; documentId: string; chunkId: string; title: string; snippet: string; similarity: number }>): Promise<void> {
    if (citations.length === 0) return;
    const { error } = await this.supabase.rpc("record_agent_knowledge_citations", {
      p_session_id: sessionId,
      p_citations: citations,
    });
    if (error) throw new Error("Agent knowledge citation persistence is unavailable");
  }
}

/** 创建当前用户的 Orchestration Repository。 */
export function createAgentOrchestrationRepository(supabase: UserSupabaseClient): AgentOrchestrationRepository {
  return new SupabaseAgentOrchestrationRepository(supabase);
}
