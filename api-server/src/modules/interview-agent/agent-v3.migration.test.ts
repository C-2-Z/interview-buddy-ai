/** Agent 3 增量迁移静态契约测试：防止旧运行时入口或关键数据升级在后续改动中回归。 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../../../../");

/** 读取本次唯一允许新增的 Agent 3 migration。 */
async function migrationSql(): Promise<string> {
  return readFile(
    resolve(ROOT, "supabase/migrations/20260715000001_add_single_agent_v3.sql"),
    "utf8",
  );
}

/** 读取 Agent 3 策略持久化热修 migration。 */
async function strategyHotfixSql(): Promise<string> {
  return readFile(
    resolve(ROOT, "supabase/migrations/20260715000002_fix_agent_v3_strategy_json_operator.sql"),
    "utf8",
  );
}

/** 读取 Agent 3 选题审计兼容增量。 */
async function questionSelectionSql(): Promise<string> {
  return readFile(
    resolve(
      ROOT,
      "supabase/migrations/20260717170000_align_agent_v3_question_selection_contract.sql",
    ),
    "utf8",
  );
}

test("Agent 3 migration adds the new persistence and retirement contracts", async () => {
  const sql = await migrationSql();
  for (const required of [
    "agent-v3",
    "result_context",
    "role_ids",
    "dimension_keys",
    "topic_keys",
    "evidence_goal_keys",
    "commit_agent_v3_preparation",
    "commit_agent_v3_strategy_revision",
    "commit_agent_v3_question",
    "commit_agent_v3_question_evaluation",
    "get_agent_v3_workspace",
    "legacy_agent_retired",
  ]) {
    assert.equal(sql.includes(required), true, `missing migration contract: ${required}`);
  }
  assert.match(sql, /status NOT IN \('completed', 'abandoned', 'failed'\)/);
  assert.match(sql, /rubric-v3/);
  assert.match(sql, /questionApplicableDimensions/);
  assert.match(sql, /interview_sessions_prepared_contract_check/);
  assert.match(sql, /interview_sessions_current_question_contract_check/);
  assert.match(sql, /agent_version IN \('agent-v1', 'agent-v2', 'agent-v3'\)/);
});

test("runtime scoring repository calls only the v3 scoring RPC", async () => {
  const source = await readFile(
    resolve(ROOT, "api-server/src/modules/interview-agent/evaluation/evaluation.repository.ts"),
    "utf8",
  );
  assert.match(source, /commit_agent_v3_question_evaluation/);
  assert.equal(source.includes('rpc("commit_agent_question_evaluation"'), false);
});

test("Agent 3 strategy JSONB validation is parenthesized and hotfixed incrementally", async () => {
  const [base, hotfix] = await Promise.all([migrationSql(), strategyHotfixSql()]);
  assert.match(base, /\(\(p_strategy->'questionCriteria'\) - ARRAY\[/);
  assert.match(hotfix, /commit_agent_v3_strategy_revision/);
  assert.match(hotfix, /20260715000002/);
});

test("question selection migration aligns audited preparation and runtime commits", async () => {
  const sql = await questionSelectionSql();
  for (const required of [
    "question_family_key",
    "selection_tier",
    "selection_score",
    "selection_reason_code",
    "_validate_agent_v3_question_selection",
    "commit_agent_v3_preparation",
    "commit_agent_v3_question",
  ]) {
    assert.equal(
      sql.includes(required),
      true,
      `missing question selection contract: ${required}`,
    );
  }
  assert.match(sql, /model_generated/);
  assert.match(sql, /bank_exact/);
});
