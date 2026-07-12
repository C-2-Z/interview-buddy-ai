/** Interview Agent 模型运行审计的成功、失败与脱敏边界测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import type { AgentRunAuditInput, AgentRunAuditor } from "./agent-run.repository.js";
import { executeAuditedModelCall } from "./agent-run.service.js";

const BASE_INPUT = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  operationKey: "model:test:1",
  nodeName: "test_node",
  modelProvider: "deepseek",
  modelName: "deepseek-chat",
  promptVersion: "agent-v1-test",
} as const;

/** 创建只收集安全审计字段的内存审计器。 */
function createCollector(records: AgentRunAuditInput[]): AgentRunAuditor {
  return {
    async record(input) { records.push(input); },
  };
}

test("successful model call records duration and token usage", async () => {
  const records: AgentRunAuditInput[] = [];
  const result = await executeAuditedModelCall(
    { ...BASE_INPUT, auditor: createCollector(records) },
    async (onUsage) => {
      onUsage({ promptTokens: 12, completionTokens: 8, totalTokens: 20 });
      return "ok";
    },
  );
  assert.equal(result, "ok");
  assert.equal(records.length, 1);
  assert.deepEqual(
    {
      status: records[0].status,
      promptTokens: records[0].promptTokens,
      completionTokens: records[0].completionTokens,
      totalTokens: records[0].totalTokens,
      errorCode: records[0].errorCode,
    },
    {
      status: "completed",
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      errorCode: null,
    },
  );
  assert.ok(records[0].durationMs >= 0);
  assert.deepEqual(
    Object.keys(records[0]).sort(),
    [
      "completionTokens", "durationMs", "errorCode", "modelName",
      "modelProvider", "nodeName", "operationKey", "promptTokens",
      "promptVersion", "sessionId", "status", "totalTokens",
    ].sort(),
  );
});

test("failed model call records stable error code and preserves original error", async () => {
  const records: AgentRunAuditInput[] = [];
  const expected = new Error("provider secret detail");
  await assert.rejects(
    executeAuditedModelCall(
      { ...BASE_INPUT, auditor: createCollector(records) },
      async () => { throw expected; },
    ),
    (error) => error === expected,
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "failed");
  assert.equal(records[0].errorCode, "model_call_failed");
  assert.equal(JSON.stringify(records[0]).includes("secret detail"), false);
});

test("audit persistence failure never changes a successful model result", async () => {
  const result = await executeAuditedModelCall(
    {
      ...BASE_INPUT,
      auditor: { async record() { throw new Error("audit unavailable"); } },
    },
    async () => "business-result",
  );
  assert.equal(result, "business-result");
});
