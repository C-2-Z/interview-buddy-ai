/** 旧 Sessions 创建接口的 Agent 委托与敏感字段隔离测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { createCompatibleInterviewSession } from "./agent-compat.service.js";

const INPUT = {
  position: "后端工程师",
  difficulty: "中级" as const,
  jobDescription: "负责高并发服务",
  questionCount: 5,
  targetCompany: "示例公司",
  modelProvider: "openai" as const,
  modelName: "gpt-4.1-mini",
  userApiKey: "sk-must-not-forward",
  resumeText: "完整简历不得转发",
  resumeId: "33333333-3333-4333-8333-333333333333",
};

test("enabled compatibility route maps legacy input to safe Agent creation", async () => {
  let captured: unknown;
  const result = await createCompatibleInterviewSession({
    supabase: {} as UserSupabaseClient,
    userId: "22222222-2222-4222-8222-222222222222",
    input: INPUT,
  }, {
    agentEnabled: true,
    createAgentService: (() => ({
      async createSession(input: unknown) {
        captured = input;
        return { sessionId: "11111111-1111-4111-8111-111111111111", threadId: "11111111-1111-4111-8111-111111111111", phase: "preparing", eventCursor: 1 };
      },
    })) as never,
  });
  assert.equal("phase" in result ? result.phase : null, "preparing");
  assert.deepEqual(captured, {
    mode: "single",
    interviewMode: "text",
    position: "后端工程师",
    difficulty: "中级",
    questionCount: 5,
    jobDescription: "负责高并发服务",
    targetCompany: "示例公司",
    skillId: undefined,
    resumeId: "33333333-3333-4333-8333-333333333333",
    modelProvider: "openai",
    modelName: "gpt-4.1-mini",
    webResearch: true,
  });
  assert.equal(JSON.stringify(captured).includes("sk-must-not-forward"), false);
  assert.equal(JSON.stringify(captured).includes("完整简历"), false);
});

test("disabled compatibility route preserves the legacy creation path", async () => {
  let called = false;
  const result = await createCompatibleInterviewSession({
    supabase: {} as UserSupabaseClient,
    userId: "22222222-2222-4222-8222-222222222222",
    input: INPUT,
  }, {
    agentEnabled: false,
    createLegacy: (async () => {
      called = true;
      return { sessionId: "legacy-session" };
    }) as never,
  });
  assert.equal(called, true);
  assert.equal(result.sessionId, "legacy-session");
});
