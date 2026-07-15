/** Interview Agent 后续题按冻结计划、题库优先和历史去重测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import type { AgentModelProvider, AgentQuestionModelInput } from "../providers/agent-model.provider.js";
import type { QuestionRuntimeRepository } from "./question-runtime.repository.js";
import { DefaultQuestionRuntimeService } from "./question-runtime.service.js";
import type { CommitRuntimeQuestionInput, RuntimeQuestionContext } from "./question-runtime.types.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const FIRST_BANK_ID = "22222222-2222-4222-8222-222222222222";
const NEXT_BANK_ID = "33333333-3333-4333-8333-333333333333";

/** 构造三题单角色冻结上下文。 */
function contextFixture(): RuntimeQuestionContext {
  return {
    config: {
      experienceMode: "coaching",
      interviewMode: "text", position: "后端工程师", difficulty: "中级", questionCount: 3,
      jobDescription: null, targetCompany: null, skillId: null, resumeId: null,
      modelProvider: "deepseek", modelName: "deepseek-v4-flash", webResearch: false, promptVersion: "agent-v3-test",
    },
    plan: {
      version: "plan-v3",
      rolePlan: [{ stageIndex: 0, roleId: "general", questionCount: 3, startQuestionIndex: 0, endQuestionIndex: 2 }],
      capabilityBlueprint: {
        version: "capability-v1", questionCount: 3,
        dimensions: [
          { key: "technical_depth", label: "技术深度", source: "universal", weight: 1, targetQuestionCount: 2, evidenceHints: [] },
          { key: "problem_solving", label: "问题解决", source: "universal", weight: 1, targetQuestionCount: 1, evidenceHints: [] },
        ],
      },
      questionRoles: ["general", "general", "general"],
      questionDimensions: ["technical_depth", "problem_solving", "technical_depth"],
      questionApplicableDimensions: [["technical_depth", "COMMUNICATION", "LOGICAL_THINKING"], ["problem_solving", "COMMUNICATION", "LOGICAL_THINKING"], ["technical_depth", "COMMUNICATION", "LOGICAL_THINKING"]],
      questionEvidenceGoals: [["situation", "action", "result"], ["situation", "action", "result"], ["situation", "action", "result"]],
      firstQuestion: { id: FIRST_BANK_ID, question: "第一题", position: "后端工程师", difficulty: "中级", type: "技术题", tags: ["technical_depth"], roleIds: ["general"], dimensionKeys: ["technical_depth"], topicKeys: ["backend"], evidenceGoalKeys: ["situation", "action", "result"], source: "bank" },
      researchStatus: "skipped", researchSources: [],
    },
    questions: [{ id: "44444444-4444-4444-8444-444444444444", question: "第一题", orderIndex: 0, dimensionKey: "technical_depth", bankQuestionId: FIRST_BANK_ID }],
  };
}

test("runtime excludes used questions and commits the frozen index dimension", async () => {
  let committed: CommitRuntimeQuestionInput | undefined;
  const repository: QuestionRuntimeRepository = {
    async loadContext() { return contextFixture(); },
    async commitQuestion(input) {
      committed = input;
      return {
        committed: true, duplicate: false, operationKey: "question:1", questionId: input.id,
        orderIndex: input.orderIndex, roleId: input.roleId, dimensionKey: input.dimensionKey, eventSequence: 8,
      };
    },
  };
  const model: AgentModelProvider = { async generateQuestion() { throw new Error("bank candidate must win"); } };
  const service = new DefaultQuestionRuntimeService({
    runtimeRepository: repository,
    preparationRepository: {
      async searchQuestionBank() {
        return [
          { id: FIRST_BANK_ID, question: "第一题", position: "后端工程师", difficulty: "中级", type: "技术题", tags: ["technical_depth"], roleIds: ["general"], dimensionKeys: ["technical_depth"], topicKeys: ["backend"], evidenceGoalKeys: ["situation", "action", "result"], source: "bank" },
          { id: NEXT_BANK_ID, question: "请说明一次线上问题排查过程。", position: "后端工程师", difficulty: "中级", type: "问题解决", tags: ["problem_solving"], roleIds: ["general"], dimensionKeys: ["problem_solving"], topicKeys: ["backend"], evidenceGoalKeys: ["situation", "action", "result"], source: "bank" },
        ];
      },
    },
    modelProvider: model,
  });
  const selected = await service.selectAndCommit({ sessionId: SESSION_ID, questionIndex: 1, roleId: "general" });
  assert.equal(committed?.bankQuestionId, NEXT_BANK_ID);
  assert.equal(committed?.dimensionKey, "problem_solving");
  assert.equal(committed?.orderIndex, 1);
  assert.equal(selected.questionId, committed?.id);
});

test("runtime rejects a role that differs from the frozen plan", async () => {
  const service = new DefaultQuestionRuntimeService({
    runtimeRepository: {
      async loadContext() { return contextFixture(); },
      async commitQuestion() { throw new Error("must not commit"); },
    },
    preparationRepository: { async searchQuestionBank() { return []; } },
    modelProvider: { async generateQuestion() { throw new Error("must not generate"); } },
  });
  await assert.rejects(
    service.selectAndCommit({ sessionId: SESSION_ID, questionIndex: 1, roleId: "technical" }),
    /Frozen Agent plan/,
  );
});

test("model fallback receives temporary job, resume, research and authorized tool context", async () => {
  const base = contextFixture();
  const context: RuntimeQuestionContext = {
    ...base,
    config: {
      ...base.config,
      jobDescription: "负责高并发订单服务",
      resumeId: "55555555-5555-4555-8555-555555555555",
    },
    plan: {
      ...base.plan,
      researchSources: [{
    category: "role",
    query: "backend role",
    title: "Role profile",
    url: "https://example.test/role",
    snippet: "Requires incident diagnosis",
    fetchedAt: "2026-07-15T00:00:00.000Z",
    contentHash: "a".repeat(64),
      }],
    },
  };
  let modelInput: AgentQuestionModelInput | undefined;
  const service = new DefaultQuestionRuntimeService({
    runtimeRepository: {
      async loadContext() { return context; },
      async commitQuestion(input) {
        return {
          committed: true,
          duplicate: false,
          operationKey: "question:1",
          questionId: input.id,
          orderIndex: input.orderIndex,
          roleId: input.roleId,
          dimensionKey: input.dimensionKey,
          eventSequence: 9,
        };
      },
    },
    preparationRepository: {
      async searchQuestionBank() { return []; },
      async loadResumeSummary() {
        return {
          resumeId: "55555555-5555-4555-8555-555555555555",
          skills: ["TypeScript"],
          roles: ["backend engineer"],
          projects: ["order platform"],
          overallAssessment: "reduced P95",
        };
      },
    },
    async loadObservationContexts(_sessionId, observationIds) {
      assert.deepEqual(observationIds, ["66666666-6666-4666-8666-666666666666"]);
      return ["authorized Brain citation and memory summary"];
    },
    modelProvider: {
      async generateQuestion(input) {
        modelInput = input;
        return {
          questionId: "model:context",
          content: "请说明一次线上故障诊断。",
          modelProvider: "deepseek",
          modelName: "deepseek-v4-flash",
          promptVersion: "agent-v3-test",
        };
      },
    },
  });
  await service.selectAndCommit({
    sessionId: SESSION_ID,
    questionIndex: 1,
    roleId: "general",
    primaryDimension: "SHOULD_NOT_OVERRIDE_FROZEN_PLAN",
    topicKeys: ["incident"],
    evidenceGoalKeys: ["action", "result"],
    observationIds: ["66666666-6666-4666-8666-666666666666"],
  });
  assert.equal(modelInput?.dimensionKey, "problem_solving");
  assert.equal(modelInput?.trustedContext?.jobDescription, "负责高并发订单服务");
  assert.deepEqual(modelInput?.trustedContext?.resumeSummary, {
    resumeId: "55555555-5555-4555-8555-555555555555",
    skills: ["TypeScript"],
    roles: ["backend engineer"],
    projects: ["order platform"],
    overallAssessment: "reduced P95",
  });
  assert.match(modelInput?.untrustedResearchContext ?? "", /incident diagnosis/);
  assert.match(modelInput?.toolResultContext ?? "", /Brain citation/);
});
