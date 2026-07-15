/** 独立清理已终止 v1/v2 会话 checkpoint；默认只预览，必须显式传入 --execute。 */
import { Pool, type PoolClient } from "pg";
import { consola } from "consola";

const LEGACY_NAMESPACES = ["agent-v1", "agent-v2"] as const;

/** 校验 checkpoint schema 标识符，避免把环境变量直接拼入 SQL。 */
function checkpointSchema(): string {
  const schema = process.env.AGENT_CHECKPOINT_SCHEMA?.trim() || "langgraph";
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) throw new Error("Invalid checkpoint schema");
  return schema;
}

/** 读取被迁移标记终止的 legacy 会话 ID。 */
async function loadRetiredSessionIds(client: PoolClient): Promise<string[]> {
  const result = await client.query<{ id: string }>(`
    select id::text
    from public.interview_sessions
    where agent_version = any($1::text[])
      and status = 'failed'
      and agent_config->>'retirementReason' = 'legacy_agent_retired'
    order by id
  `, [LEGACY_NAMESPACES]);
  return result.rows.map((row) => row.id);
}

/** 从全部 PostgresSaver 表删除目标 thread/namespace，事务失败时不留下半清理状态。 */
async function deleteLegacyCheckpoints(
  client: PoolClient,
  schema: string,
  sessionIds: string[],
): Promise<number> {
  if (sessionIds.length === 0) return 0;
  let deleted = 0;
  for (const table of ["checkpoint_writes", "checkpoint_blobs", "checkpoints"] as const) {
    const result = await client.query(
      `delete from "${schema}"."${table}" where thread_id = any($1::text[]) and checkpoint_ns = any($2::text[])`,
      [sessionIds, LEGACY_NAMESPACES],
    );
    deleted += result.rowCount ?? 0;
  }
  return deleted;
}

/** 运行安全预览或经明确授权的实际清理。 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const execute = process.argv.includes("--execute");
  const schema = checkpointSchema();
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const sessionIds = await loadRetiredSessionIds(client);
    if (!execute) {
      consola.info({
        message: "Legacy checkpoint cleanup preview",
        retiredSessionCount: sessionIds.length,
        namespaces: LEGACY_NAMESPACES,
        schema,
      });
      return;
    }
    await client.query("begin");
    const deletedRows = await deleteLegacyCheckpoints(client, schema, sessionIds);
    await client.query("commit");
    consola.success({ message: "Legacy checkpoints deleted", deletedRows });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await main().catch((error: unknown) => {
  consola.error(error instanceof Error ? error : new Error("Legacy checkpoint cleanup failed"));
  process.exitCode = 1;
});
