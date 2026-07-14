// @ts-nocheck - Agent v2 增量表将在下一次 Supabase 类型生成后纳入静态数据库类型。
/** Agent Memory Repository：依赖 RLS 读写当前用户的脱敏训练摘要。 */
import { z } from "zod";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { AgentTrainingSummarySchema } from "./agent-memory.schemas.js";
import type { AgentMemoryView, AgentTrainingSummary } from "./agent-memory.types.js";

const MemoryRowSchema = z.object({
  user_id: z.string().uuid(),
  enabled: z.boolean(),
  summary: z.unknown().nullable(),
  updated_at: z.string(),
}).passthrough();

/** Agent Memory 持久化端口。 */
export interface AgentMemoryRepository {
  /** 读取当前用户授权和摘要。 */
  get(userId: string): Promise<AgentMemoryView>;
  /** 设置授权；首次设置时创建空配置。 */
  setEnabled(userId: string, enabled: boolean): Promise<AgentMemoryView>;
  /** 清除摘要但保留授权选择。 */
  clear(userId: string): Promise<AgentMemoryView>;
  /** 用报告聚合结果覆盖摘要。 */
  saveSummary(userId: string, summary: AgentTrainingSummary): Promise<void>;
}

/** Supabase Agent Memory Repository。 */
export class SupabaseAgentMemoryRepository implements AgentMemoryRepository {
  /** @param supabase - 携带当前用户 JWT 的数据库客户端。 */
  constructor(private readonly supabase: UserSupabaseClient) {}

  /** @inheritdoc */
  async get(userId: string): Promise<AgentMemoryView> {
    const { data, error } = await this.supabase
      .from("agent_training_profiles")
      .select("user_id, enabled, summary, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("Agent memory persistence is unavailable");
    if (!data) return { enabled: false, summary: null, updatedAt: null };
    const row = MemoryRowSchema.parse(data);
    return {
      enabled: row.enabled,
      summary: row.summary === null ? null : AgentTrainingSummarySchema.parse(row.summary),
      updatedAt: row.updated_at,
    };
  }

  /** @inheritdoc */
  async setEnabled(userId: string, enabled: boolean): Promise<AgentMemoryView> {
    const { error } = await this.supabase.rpc("set_agent_training_memory", {
      p_enabled: enabled,
    });
    if (error) throw new Error("Agent memory persistence is unavailable");
    return this.get(userId);
  }

  /** @inheritdoc */
  async clear(userId: string): Promise<AgentMemoryView> {
    const { error } = await this.supabase.rpc("clear_agent_training_memory");
    if (error) throw new Error("Agent memory persistence is unavailable");
    return this.get(userId);
  }

  /** @inheritdoc */
  async saveSummary(userId: string, summary: AgentTrainingSummary): Promise<void> {
    const parsed = AgentTrainingSummarySchema.parse(summary);
    const { error } = await this.supabase.rpc("commit_agent_training_summary", {
      p_summary: parsed,
    });
    if (error) throw new Error("Agent memory persistence is unavailable");
  }
}

/** 创建用户作用域 Agent Memory Repository。 */
export function createAgentMemoryRepository(supabase: UserSupabaseClient): AgentMemoryRepository {
  return new SupabaseAgentMemoryRepository(supabase);
}
