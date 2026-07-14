/** Agent readiness 模块的只读数据库与 checkpoint 元数据探测。 */
import { Pool } from "pg";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { resolveAgentCheckpointSchema } from "../interview-agent/graph/checkpointer.js";
import type { AgentReadinessInfrastructure } from "./agent-readiness.types.js";

/** 能证明 Agent 主业务迁移完整的只读 RPC 集合。 */
const REQUIRED_AGENT_RPCS = [
  "create_agent_interview_session",
  "commit_agent_preparation",
  "accept_agent_input",
  "commit_agent_question_evaluation",
  "finalize_agent_report",
  "record_agent_run",
] as const;

/** Supabase OpenAPI 元数据的最小安全形状。 */
type SupabaseOpenApiDocument = {
  /** PostgREST 暴露的表和 RPC 路径。 */ paths?: Record<string, unknown>;
};

/**
 * 从只读 OpenAPI 元数据确认 Canonical Agent 的关键 RPC 已全部部署。
 *
 * @param document - Supabase PostgREST OpenAPI 响应。
 * @returns 所有必要 RPC 均存在时为 true。
 */
export function hasRequiredAgentRpcs(document: unknown): boolean {
  if (!document || typeof document !== "object") return false;
  const paths = (document as SupabaseOpenApiDocument).paths;
  if (!paths || typeof paths !== "object") return false;
  return REQUIRED_AGENT_RPCS.every((name) => Object.hasOwn(paths, `/rpc/${name}`));
}

/**
 * 在版本探测 RPC 尚未部署时，通过服务端只读 OpenAPI 回退验证既有 Agent RPC。
 *
 * @returns 关键 RPC 完整且元数据请求成功时为 true。
 */
async function inspectLegacyAgentRpcMetadata(): Promise<boolean> {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return false;
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/openapi+json",
    },
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) return false;
  return hasRequiredAgentRpcs(await response.json());
}

/** readiness 数据访问依赖，便于单元测试隔离真实连接。 */
export type AgentReadinessRepositoryDependencies = {
  /** 执行无副作用的业务迁移版本 RPC。 */ checkAgentDatabase(): Promise<boolean>;
  /** 验证 Agent 2.0 增量迁移版本；旧部署保持 false。 */ checkAgentV2Database?(): Promise<boolean>;
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
    const [agentDatabaseReady, agentV2DatabaseReady, checkpointSchemaReady] = await Promise.all([
      this.dependencies.checkAgentDatabase().catch(() => false),
      this.dependencies.checkAgentV2Database?.().catch(() => false) ?? false,
      this.dependencies.checkCheckpointSchema().catch(() => false),
    ]);
    return { agentDatabaseReady, agentV2DatabaseReady, checkpointSchemaReady };
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
      const client = supabase as unknown as {
        rpc(name: "check_agent_readiness"): PromiseLike<{ data: string | null; error: unknown }>;
      };
      const { data, error } = await client.rpc("check_agent_readiness");
      if (!error && (data === "20260713000001" || data === "20260714000001" || data === "20260714000002" || data === "20260714000003")) return true;
      // 老环境在应用新探测迁移前仍可通过既有只读元数据证明主链路完整，避免无谓阻断用户。
      return inspectLegacyAgentRpcMetadata();
    },
    async checkAgentV2Database() {
      const client = supabase as unknown as {
        rpc(name: "check_agent_readiness"): PromiseLike<{ data: string | null; error: unknown }>;
      };
      const { data, error } = await client.rpc("check_agent_readiness");
      return !error && data === "20260714000003";
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
