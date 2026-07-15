/** 生产 Agent 模型 Adapter 的多模型选择、结构化输出和凭据隔离测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import type { UserSupabaseClient } from "../../../shared/db/supabase.js";
import { getRolePersona } from "../roles/personas.js";
import { ProductionAgentModelProvider } from "./production-agent-model.provider.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

test("question generation uses frozen provider and parses strict JSON", async () => {
  const secret = "sk-never-enter-prompt";
  let captured = "";
  const adapter = new ProductionAgentModelProvider({
    supabase: {} as UserSupabaseClient,
    userId: "22222222-2222-4222-8222-222222222222",
    async resolveProvider(_supabase, _userId, request) {
      assert.equal(request.modelProvider, "openai");
      assert.equal(request.modelName, "gpt-4.1-mini");
      return { name: "openai", model: "gpt-4.1-mini", apiKey: secret };
    },
    async complete(messages, provider, options) {
      captured = JSON.stringify({ messages, provider: { name: provider?.name, model: provider?.model }, options });
      return "```json\n{\"question\":\"请说明一次高并发系统的容量规划过程。\"}\n```";
    },
  });
  const result = await adapter.generateQuestion({
    sessionId: SESSION_ID,
    questionIndex: 1,
    roleId: "technical",
    persona: getRolePersona("technical"),
    position: "后端工程师",
    difficulty: "高级",
    promptVersion: "agent-v3-test",
    modelProvider: "openai",
    modelName: "gpt-4.1-mini",
    dimensionKey: "system_design",
  });
  assert.equal(result.modelProvider, "openai");
  assert.equal(result.modelName, "gpt-4.1-mini");
  assert.match(result.questionId, /^model:[a-f0-9]{32}$/);
  assert.equal(captured.includes(secret), false);
  assert.match(captured, /system_design/);
});

test("follow-up generation is Persona and evidence-gap constrained", async () => {
  let prompt = "";
  const adapter = new ProductionAgentModelProvider({
    supabase: {} as UserSupabaseClient,
    userId: "22222222-2222-4222-8222-222222222222",
    async resolveProvider() {
      return { name: "deepseek", model: "deepseek-v4-flash" };
    },
    async complete(messages) {
      prompt = messages.map((message) => message.content).join("\n");
      return "{\"question\":\"你如何用指标验证这次优化的实际效果？\"}";
    },
  });
  const result = await adapter.generateFollowUp({
    sessionId: SESSION_ID,
    roleId: "technical",
    persona: getRolePersona("technical"),
    question: "请说明一次性能优化经历。",
    answer: "我完成了优化。",
    evidenceGap: "missing_result",
    followUpNumber: 1,
    modelProvider: "deepseek",
    modelName: "deepseek-v4-flash",
    promptVersion: "agent-v3-test",
  });
  assert.match(result.content, /指标/);
  assert.match(prompt, /missing_result/);
  assert.match(prompt, /追问轮次：1\/3/);
});

test("malformed model output is rejected instead of becoming a question", async () => {
  const adapter = new ProductionAgentModelProvider({
    supabase: {} as UserSupabaseClient,
    userId: "22222222-2222-4222-8222-222222222222",
    async resolveProvider() { return { name: "deepseek", model: "deepseek-v4-flash" }; },
    async complete() { return "not-json"; },
  });
  await assert.rejects(
    adapter.generateFollowUp({
      sessionId: SESSION_ID,
      roleId: "general",
      persona: getRolePersona("general"),
      question: "问题",
      answer: "回答",
      evidenceGap: "too_brief",
      followUpNumber: 1,
      modelProvider: "deepseek",
      modelName: "deepseek-v4-flash",
      promptVersion: "agent-v3-test",
    }),
  );
});
