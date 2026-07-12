/** Interview Agent 节点模型调用的脱敏运行审计 Repository。 */
import type { UserSupabaseClient } from "../../../shared/db/supabase.js";

/** Supabase 与测试 fake 共用的最小审计 RPC 端口。 */
export interface AgentRunAuditDatabaseClient {
  /** 调用脱敏运行审计 RPC。 */
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<{
    /** RPC 返回值。 */ data: unknown;
    /** Supabase 错误；成功为 null。 */ error: unknown | null;
  }>;
}

/** 一次模型尝试的安全审计输入。 */
export type AgentRunAuditInput = {
  /** 会话 UUID。 */ sessionId: string;
  /** 确定性操作键。 */ operationKey: string;
  /** Graph/Adapter 节点名。 */ nodeName: string;
  /** 完成或失败。 */ status: "completed" | "failed";
  /** 毫秒耗时。 */ durationMs: number;
  /** 模型供应商。 */ modelProvider: string;
  /** 模型名。 */ modelName: string;
  /** Prompt 版本。 */ promptVersion: string;
  /** 输入 Token。 */ promptTokens: number | null;
  /** 输出 Token。 */ completionTokens: number | null;
  /** 总 Token。 */ totalTokens: number | null;
  /** 稳定错误码；成功为 null。 */ errorCode: string | null;
};

/** 模型 Adapter 使用的审计端口。 */
export interface AgentRunAuditor {
  /** 记录一次尝试；实现不得接收 Prompt、回答或 Key。 */
  record(input: AgentRunAuditInput): Promise<void>;
}

/** Supabase RPC 审计实现。 */
export class SupabaseAgentRunAuditor implements AgentRunAuditor {
  /** @param supabase - 当前用户 Supabase client。 */
  constructor(private readonly supabase: AgentRunAuditDatabaseClient) {}

  /** @inheritdoc */
  async record(input: AgentRunAuditInput): Promise<void> {
    const { error } = await this.supabase.rpc("record_agent_run", {
      p_session_id: input.sessionId,
      p_run: input,
    });
    if (error) throw new Error("Agent run audit is unavailable");
  }
}

/** 创建用户作用域运行审计器。 */
export function createAgentRunAuditor(supabase: UserSupabaseClient): AgentRunAuditor {
  return new SupabaseAgentRunAuditor(
    supabase as unknown as AgentRunAuditDatabaseClient,
  );
}
