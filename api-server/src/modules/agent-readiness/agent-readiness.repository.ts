/** Agent readiness 模块的只读数据库与 checkpoint 元数据探测。 */
import { Pool } from "pg";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { resolveAgentCheckpointSchema } from "../interview-agent/graph/checkpointer.js";
import type { AgentReadinessInfrastructure } from "./agent-readiness.types.js";

/** readiness 数据访问依赖，便于单元测试隔离真实连接。 */
export type AgentReadinessRepositoryDependencies = {
  /** 执行无副作用的业务迁移版本 RPC。 */ checkAgentDatabase(): Promise<boolean>;
  /** 查询 checkpoint schema 中的必要表。 */ checkCheckpointSchema(): Promise<boolean>;
};

/** 只读检查 Agent 数据库和 checkpoint 初始化状态。 */
export class AgentReadinessRepository {
  /** @param dependencies - 两类只读基础设施探测。 */
  constructor(private readonly dependencies: AgentReadinessRepositoryDependencies) {}

  /**
   * 并行读取业务迁移和 checkpoint 状态，任何内部失败只映射为 false。
   *
   * @returns 不包含数据库错误或连接信息的基础设施结果。
   */
  async inspectInfrastructure(): Promise<AgentReadinessInfrastructure> {
    const [agentDatabaseReady, checkpointSchemaReady] = await Promise.all([
      this.dependencies.checkAgentDatabase().catch(() => false),
      this.dependencies.checkCheckpointSchema().catch(() => false),
    ]);
    return { agentDatabaseReady, checkpointSchemaReady };
  }
}

/**
 * 创建生产 repository；业务库通过只读版本 RPC 验证完整迁移，checkpoint 通过系统目录验证显式 setup。
 *
 * @param supabase - 当前登录用户的 Supabase 客户端。
 * @returns 可执行脱敏基础设施检查的 repository。
 */
export function createAgentReadinessRepository(
  supabase: UserSupabaseClient,
): AgentReadinessRepository {
  return new AgentReadinessRepository({
    async checkAgentDatabase() {
      // RPC 只返回固定迁移版本，既验证 PostgREST schema cache，也不会创建业务数据。
      const client = supabase as unknown as {rpc(name:"check_agent_readiness"):PromiseLike<{data:string|null;error:unknown}>};
      const { data, error } = await client.rpc("check_agent_readiness");
      return !error && data === "20260713000001";
    },
    async checkCheckpointSchema() {
      const connectionString = process.env.DATABASE_URL?.trim();
      if (!connectionString) return false;
      const schema = resolveAgentCheckpointSchema();
      const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 2_000 });
      try {
        // 只查询系统目录中的核心表名；请求路径绝不调用 PostgresSaver.setup() 或执行 DDL。
        const result = await pool.query<{ table_name: string }>(
          "select table_name from information_schema.tables where table_schema = $1 and table_name = any($2::text[])",
          [schema, ["checkpoints", "checkpoint_writes"]],
        );
        return new Set(result.rows.map((row) => row.table_name)).size === 2;
      } finally {
        await pool.end().catch(() => undefined);
      }
    },
  });
}
