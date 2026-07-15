/** Agent 工作台 Repository：通过单次所有权校验 RPC 恢复安全只读投影。 */
import { z } from "zod";
import type { UserSupabaseClient } from "../../../shared/db/supabase.js";
import type { AgentWorkspace } from "./workspace.types.js";

/** Supabase 与测试 fake 共用的最小工作台 RPC 端口。 */
export interface WorkspaceDatabaseClient {
  /** 调用数据库中的单次只读工作台投影。 */
  rpc(
    name: "get_agent_v3_workspace",
    parameters: { p_session_id: string },
  ): PromiseLike<unknown>;
}

const ResponseSchema = z.object({
  data: z.unknown(),
  error: z.unknown().nullable(),
}).passthrough();

const DimensionEvaluationSchema = z.object({
  status: z.enum(["scored", "not_observed"]),
  score: z.number().int().min(0).max(100).nullable(),
  rationale: z.string(),
  evidenceIds: z.array(z.string().uuid()),
}).passthrough();

const SnapshotSchema = z.object({
  sessionId: z.string().uuid(),
  threadId: z.string().min(1),
  version: z.literal("agent-v3"),
  mode: z.enum(["single", "panel"]),
  interviewMode: z.enum(["text", "voice"]),
  phase: z.enum(["preparing", "awaiting_answer", "reasoning", "speaking", "scoring", "role_handoff", "reporting", "completed", "failed"]),
  currentRole: z.enum(["general", "technical", "manager", "hr"]),
  currentQuestionId: z.string().uuid().nullable(),
  currentQuestionIndex: z.number().int().min(0),
  followUpCount: z.number().int().min(0),
  pendingAction: z.enum(["ask", "follow_up", "score", "handoff", "finish"]),
  eventCursor: z.number().int().min(0),
  strategyRevision: z.number().int().positive().optional(),
}).strip();

const WorkspaceSchema = z.object({
  productStatus: z.enum(["in_progress", "paused", "completed", "abandoned", "failed"]),
  snapshot: SnapshotSchema,
  config: z.object({
    position: z.string(),
    difficulty: z.string(),
    questionCount: z.number().int().positive(),
    targetCompany: z.string().nullable(),
    experienceMode: z.enum(["simulation", "coaching"]),
  }).strict(),
  research: z.object({
    status: z.enum(["pending", "running", "completed", "skipped", "failed"]),
    sources: z.array(z.object({
      id: z.string().uuid(),
      category: z.enum(["company", "role", "industry"]),
      title: z.string(),
      url: z.string(),
    }).strict()),
  }).strict(),
  strategy: z.object({
    revision: z.number().int().positive(),
    objective: z.string(),
    focusDimensions: z.array(z.string()),
    memoryApplied: z.boolean(),
    brainApplied: z.boolean(),
  }).strict().nullable(),
  activities: z.array(z.object({
    id: z.string().uuid(),
    kind: z.enum(["planning", "tool", "reflection", "memory"]),
    status: z.enum(["running", "completed", "skipped", "failed"]),
    label: z.string(),
    reasonCode: z.string().optional(),
    sourceCount: z.number().int().min(0).optional(),
  }).strict()),
  questions: z.array(z.object({
    id: z.string().uuid(),
    question: z.string(),
    orderIndex: z.number().int().min(0),
    roleId: z.enum(["general", "technical", "manager", "hr"]),
    dimensionKey: z.string(),
    source: z.enum(["bank", "model"]),
    score: z.number().int().min(0).max(100).nullable(),
    feedback: z.string().nullable(),
    messages: z.array(z.object({
      id: z.string().uuid(),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      source: z.enum(["text", "voice"]),
      interrupted: z.boolean(),
      createdAt: z.string(),
    }).strict()),
    evidence: z.array(z.object({
      id: z.string().uuid(),
      dimensionKey: z.string(),
      claim: z.string(),
      quote: z.string(),
    }).strict()),
    evaluation: z.object({
      overallScore: z.number().int().min(0).max(100),
      dimensions: z.record(DimensionEvaluationSchema),
    }).strict().nullable(),
  }).strict()),
  report: z.object({
    overallScore: z.number().int().min(0).max(100),
    overallFeedback: z.string(),
    dimensionSummary: z.unknown(),
  }).strict().nullable(),
}).strict();

/** 执行工作台 RPC，并把数据库错误收敛为不泄露底层信息的稳定异常。 */
async function execute(operation: PromiseLike<unknown>): Promise<unknown> {
  const response = ResponseSchema.safeParse(await operation);
  if (!response.success || response.data.error !== null) {
    throw new Error("Agent workspace persistence is unavailable");
  }
  return response.data.data;
}

/** 用户作用域工作台 Repository。 */
export class AgentWorkspaceRepository {
  /** @param database - 携带用户 JWT 的 Supabase RPC 端口。 */
  constructor(private readonly database: WorkspaceDatabaseClient) {}

  /**
   * 一次读取快照、题目、活动、证据和报告，避免页面恢复产生串行网络往返。
   *
   * @param sessionId - Agent 会话 UUID。
   * @returns 不含 Prompt、Key、checkpoint 或工具原文的完整页面投影。
   */
  async load(sessionId: string): Promise<AgentWorkspace> {
    const workspace = await execute(this.database.rpc("get_agent_v3_workspace", {
      p_session_id: sessionId,
    }));
    return WorkspaceSchema.parse(workspace) as AgentWorkspace;
  }
}

/** 创建当前用户作用域的工作台 Repository。 */
export function createAgentWorkspaceRepository(
  supabase: UserSupabaseClient,
): AgentWorkspaceRepository {
  return new AgentWorkspaceRepository(supabase as unknown as WorkspaceDatabaseClient);
}
