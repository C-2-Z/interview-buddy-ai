/** Interview lifecycle Repository：仅调用带用户所有权校验的数据库 RPC。 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import {
  InterviewDeleteRpcResultSchema,
  InterviewLifecycleResultSchema,
} from "./interview-lifecycle.schemas.js";
import type {
  InterviewLifecycleAction,
  InterviewLifecycleResult,
} from "./interview-lifecycle.types.js";

/** lifecycle Repository 的受限 RPC 端口，便于单元测试替换。 */
export interface InterviewLifecycleDatabase {
  /** 调用数据库函数且不暴露原始数据库异常。 */
  rpc(name: string, params: Record<string, unknown>): PromiseLike<{
    /** RPC 安全 JSON 结果。 */
    data: unknown;
    /** 任意数据库错误只转换为稳定模块错误。 */
    error: unknown;
  }>;
}

/** 生命周期持久化失败；消息不包含数据库原始错误或堆栈。 */
export class InterviewLifecycleRepositoryError extends Error {
  /** 创建稳定 Repository 错误。 */
  constructor() {
    super("Interview lifecycle persistence is unavailable.");
    this.name = "InterviewLifecycleRepositoryError";
  }
}

/** 用户作用域的生命周期 Repository。 */
export class InterviewLifecycleRepository {
  /** @param database - 携带当前用户 JWT 的数据库端口。 */
  constructor(private readonly database: InterviewLifecycleDatabase) {}

  /**
   * 调用 SECURITY DEFINER RPC，在单个事务中锁定会话、校验所有权并更新产品状态或阶段性报告。
   *
   * @param sessionId - 当前用户拥有的 Agent 会话 UUID。
   * @param action - 暂停、恢复、提前结束或放弃。
   * @returns 不含用户正文或数据库细节的生命周期投影。
   */
  async transition(
    sessionId: string,
    action: InterviewLifecycleAction,
  ): Promise<InterviewLifecycleResult> {
    const response = await this.database.rpc("manage_agent_session_lifecycle", {
      p_session_id: sessionId,
      p_action: action,
    });
    if (response.error) throw new InterviewLifecycleRepositoryError();
    const parsed = InterviewLifecycleResultSchema.safeParse(response.data);
    if (!parsed.success) throw new InterviewLifecycleRepositoryError();
    return parsed.data;
  }

  /**
   * 调用所有权校验 RPC 删除业务会话；外键级联清理题目、消息、评分、证据与审计记录。
   *
   * @param sessionId - 当前用户拥有的 Agent 会话 UUID。
   * @returns 用于继续清理 checkpoint 的 thread ID。
   */
  async deleteSession(sessionId: string): Promise<{ sessionId: string; threadId: string; deleted: true }> {
    const response = await this.database.rpc("delete_agent_session", {
      p_session_id: sessionId,
    });
    if (response.error) throw new InterviewLifecycleRepositoryError();
    const parsed = InterviewDeleteRpcResultSchema.safeParse(response.data);
    if (!parsed.success) throw new InterviewLifecycleRepositoryError();
    return parsed.data;
  }
}

/**
 * 创建用户作用域生命周期 Repository。
 *
 * @param supabase - requireAuth 注入的用户 Supabase client。
 * @returns 仅暴露生命周期 RPC 的 Repository。
 */
export function createInterviewLifecycleRepository(
  supabase: UserSupabaseClient,
): InterviewLifecycleRepository {
  return new InterviewLifecycleRepository(
    supabase as unknown as InterviewLifecycleDatabase,
  );
}
