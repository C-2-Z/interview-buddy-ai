/** Agent Orchestration Service 单元测试：验证工具审批、预算、修复和确定性降级。 */
import assert from "node:assert/strict";
import test from "node:test";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import type { AgentMemoryRepository } from "../agent-memory/agent-memory.repository.js";
import { AgentMemoryService } from "../agent-memory/agent-memory.service.js";
import type { InterviewAgentTools } from "../interview-agent/tools/interview-agent.tools.js";
import type { WebSearchProvider } from "../interview-agent/providers/web-search.provider.js";
import type { AgentOrchestrationModel } from "./agent-orchestration.provider.js";
import type { AgentOrchestrationRepository } from "./agent-orchestration.repository.js";
import { AgentOrchestrationService } from "./agent-orchestration.service.js";
import type { AgentPlanningContext, AgentStrategyDraft } from "./agent-orchestration.types.js";

const CONTEXT: AgentPlanningContext = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  position: "后端工程师",
  difficulty: "中级",
  targetCompany: null,
  brainId: null,
  useTrainingMemory: false,
  webResearch: false,
  modelProvider: "deepseek",
  modelName: "deepseek-chat",
  promptVersion: "agent-v2-test",
  allowedDimensions: ["communication", "technical_depth", "evidence"],
};

/** 构造只记录行为的编排依赖，避免测试接触网络和数据库。 */
function harness(model: AgentOrchestrationModel) {
  const activities: Array<{ id: string; kind: string; status: string; label: string }> = [];
  const strategies: AgentStrategyDraft[] = [];
  let questionSearches = 0;
  let messageLoads = 0;
  const repository: AgentOrchestrationRepository = {
    async commitStrategy(input) { strategies.push(input.draft); return { id: crypto.randomUUID(), revision: strategies.length }; },
    async recordActivity(_sessionId, activity, activityId) {
      const id = activityId ?? crypto.randomUUID();
      activities.push({ id, kind: activity.kind, status: activity.status, label: activity.label });
      return id;
    },
    async listActivities() { return []; },
    async getLatestStrategy() { return null; },
    async getLatestEvaluation() { return { communication: { score: 58 } }; },
    async getReportDimensions() { return { communication: { score: 62 } }; },
    async recordKnowledgeCitations() {},
  };
  const tools: InterviewAgentTools = {
    async loadSkill() { return null; },
    async loadResumeSummary() { return null; },
    async searchQuestionBank() { questionSearches += 1; return []; },
    async loadSessionMessages() { messageLoads += 1; return ["message-id"]; },
    async loadRubric() { return []; },
  };
  const memoryRepository: AgentMemoryRepository = {
    async get() { return { enabled: false, summary: null, updatedAt: null }; },
    async setEnabled() { return { enabled: false, summary: null, updatedAt: null }; },
    async clear() { return { enabled: false, summary: null, updatedAt: null }; },
    async saveSummary() {},
  };
  const webSearch: WebSearchProvider = { available: false, async search() { return []; } };
  const service = new AgentOrchestrationService({
    repository,
    model,
    tools,
    webSearch,
    memory: new AgentMemoryService(memoryRepository),
    supabase: {} as UserSupabaseClient,
  });
  return { service, activities, strategies, counts: () => ({ questionSearches, messageLoads }) };
}

test("planner approves only available distinct read tools within budget", async () => {
  const draft: AgentStrategyDraft = {
    objective: "收集可验证的岗位能力证据",
    focusDimensions: ["communication"],
    questionIntent: "验证候选人的具体行动和结果",
    activityLabel: "已制定本场提问策略",
    toolRequests: [
      { name: "web_search", focus: "公司", reasonCode: "company_context" },
      { name: "search_knowledge", focus: "知识", reasonCode: "brain_context" },
      { name: "load_training_profile", focus: "弱项", reasonCode: "memory_context" },
      { name: "search_question_bank", focus: "题型", reasonCode: "question_context" },
      { name: "search_question_bank", focus: "重复", reasonCode: "duplicate" },
      { name: "load_session_messages", focus: "历史", reasonCode: "session_context" },
    ],
  };
  const model: AgentOrchestrationModel = {
    async plan() { return draft; },
    async reflect() { return draft; },
    async decide() { return { action: "score", reasonCode: "enough", followUpQuestion: null }; },
  };
  const fake = harness(model);
  const receipt = await fake.service.planSession(CONTEXT);
  assert.deepEqual(fake.strategies[0].toolRequests.map((item) => item.name), ["search_question_bank", "load_session_messages"]);
  assert.deepEqual(fake.counts(), { questionSearches: 1, messageLoads: 1 });
  assert.equal(receipt.observationIds.length, 2);
  const planning = fake.activities.filter((activity) => activity.kind === "planning");
  assert.deepEqual(planning.map((activity) => activity.status), ["running", "completed"]);
  assert.equal(planning[0].id, planning[1].id);
  const tools = fake.activities.filter((activity) => activity.kind === "tool");
  assert.deepEqual(tools.map((activity) => activity.status), ["running", "running", "completed", "completed"]);
  const toolLifecycles = new Map<string, typeof tools>();
  for (const activity of tools) {
    toolLifecycles.set(activity.id, [...(toolLifecycles.get(activity.id) ?? []), activity]);
  }
  assert.equal(toolLifecycles.size, 2);
  for (const lifecycle of toolLifecycles.values()) {
    assert.deepEqual(lifecycle.map((activity) => activity.status), ["running", "completed"]);
  }
});

test("invalid planner output gets one repair then deterministic fallback", async () => {
  let calls = 0;
  const model: AgentOrchestrationModel = {
    async plan() { calls += 1; return { objective: "bad", focusDimensions: ["forbidden"], questionIntent: "bad", activityLabel: "bad", toolRequests: [] }; },
    async reflect() { throw new Error("not used"); },
    async decide() { throw new Error("invalid"); },
  };
  const fake = harness(model);
  const receipt = await fake.service.planSession(CONTEXT);
  assert.equal(calls, 2);
  assert.deepEqual(fake.strategies[0].focusDimensions, CONTEXT.allowedDimensions);
  assert.equal(receipt.observationIds.length, 0);
  assert.deepEqual(await fake.service.decideResponse({
    sessionId: CONTEXT.sessionId,
    question: "请举例",
    answer: "很短",
    roleId: "general",
    followUpCount: 0,
    modelProvider: "deepseek",
    modelName: "deepseek-chat",
    promptVersion: "agent-v2-test",
  }), {
    action: "follow_up",
    reasonCode: "deterministic_fallback",
    followUpQuestion: "请补充一个具体场景，并说明你的行动和最终结果。",
  });
});

test("response decision enforces the frozen follow-up limit before calling the model", async () => {
  let calls = 0;
  const model: AgentOrchestrationModel = {
    async plan() { throw new Error("not used"); },
    async reflect() { throw new Error("not used"); },
    async decide() { calls += 1; return { action: "follow_up", reasonCode: "more", followUpQuestion: "继续" }; },
  };
  const fake = harness(model);
  const decision = await fake.service.decideResponse({
    sessionId: CONTEXT.sessionId,
    question: "问题",
    answer: "回答",
    roleId: "general",
    followUpCount: 3,
    modelProvider: "deepseek",
    modelName: "deepseek-chat",
    promptVersion: "agent-v2-test",
  });
  assert.deepEqual(decision, { action: "score", reasonCode: "follow_up_limit", followUpQuestion: null });
  assert.equal(calls, 0);
});
