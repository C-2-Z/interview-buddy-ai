/** Agent v2 增量迁移静态契约测试：防止双版本、RLS 和 RPC 锚点在发布前漂移。 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("v2 migration defines dual-version persistence, RLS and atomic write RPCs", async () => {
  const migrationDirectory = new URL("../../../../supabase/migrations/", import.meta.url);
  const sql = await readFile(new URL("20260714000002_add_controlled_agent_v2.sql", migrationDirectory), "utf8");
  for (const table of [
    "agent_strategy_revisions",
    "agent_activities",
    "agent_tool_runs",
    "agent_knowledge_citations",
    "agent_training_profiles",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  for (const rpc of [
    "commit_agent_strategy_revision",
    "record_agent_activity",
    "record_agent_knowledge_citations",
    "set_agent_training_memory",
    "clear_agent_training_memory",
    "commit_agent_training_summary",
  ]) assert.match(sql, new RegExp(`FUNCTION public\\.${rpc}`));
  assert.match(sql, /agent_version IN \('agent-v1', 'agent-v2'\)/);
  assert.match(sql, /result_hash TEXT NOT NULL/);
  assert.match(sql, /duration_ms INTEGER NOT NULL/);
});

test("activity progress migration updates one audit row from running to its terminal state", async () => {
  const migrationDirectory = new URL("../../../../supabase/migrations/", import.meta.url);
  const sql = await readFile(
    new URL("20260714000003_update_agent_activity_progress.sql", migrationDirectory),
    "utf8",
  );

  assert.match(sql, /FUNCTION public\.record_agent_activity/);
  assert.match(sql, /ON CONFLICT \(id\) DO UPDATE SET/);
  assert.match(sql, /'agent\.activity'/);
  assert.match(sql, /20260714000003/);
});

test("activity event migration permits the SSE event emitted by the activity RPC", async () => {
  const migrationDirectory = new URL("../../../../supabase/migrations/", import.meta.url);
  const sql = await readFile(
    new URL("20260714000004_allow_agent_activity_events.sql", migrationDirectory),
    "utf8",
  );

  assert.match(sql, /DROP CONSTRAINT IF EXISTS agent_events_type_check/);
  assert.match(sql, /'agent\.activity'/);
  assert.match(sql, /20260714000004/);
});

test("current-question migration permits the shared projection for v2 sessions", async () => {
  const migrationDirectory = new URL("../../../../supabase/migrations/", import.meta.url);
  const sql = await readFile(
    new URL("20260714000005_allow_agent_v2_current_question.sql", migrationDirectory),
    "utf8",
  );

  assert.match(sql, /interview_sessions_current_question_contract_check/);
  assert.match(sql, /agent_version IN \('agent-v1', 'agent-v2'\)/);
  assert.match(sql, /20260714000005/);
});

test("workspace projection migration provides one ownership-checked read RPC", async () => {
  const migrationDirectory = new URL("../../../../supabase/migrations/", import.meta.url);
  const sql = await readFile(
    new URL("20260714000006_add_agent_workspace_projection.sql", migrationDirectory),
    "utf8",
  );

  assert.match(sql, /FUNCTION public\.get_agent_workspace/);
  assert.match(sql, /session\.user_id = v_user_id/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_agent_workspace\(UUID\) FROM PUBLIC, anon/);
  assert.match(sql, /20260714000006/);
});

test("create-session upgrade anchors still exist in the preceding canonical migration", async () => {
  const migrationDirectory = new URL("../../../../supabase/migrations/", import.meta.url);
  const base = await readFile(new URL("20260711000002_add_interview_agent_foundation.sql", migrationDirectory), "utf8");
  for (const anchor of [
    "  v_prompt_version TEXT;",
    "  IF public._agent_json_has_sensitive_key(p_session) THEN",
    "      'promptVersion'",
    "    OR (p_session ? 'promptVersion' AND jsonb_typeof(p_session->'promptVersion') IS DISTINCT FROM 'string')",
    "  v_job_description := NULLIF",
    "    'resumeId', v_resume_id,",
  ]) assert.equal(base.includes(anchor), true, `missing migration upgrade anchor: ${anchor}`);
});
