/** 后续题 Repository 对历史计划和 selection audit RPC 序列化的兼容测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  SupabaseQuestionRuntimeRepository,
  type QuestionRuntimeDatabaseClient,
  type QuestionRuntimeDatabaseQuery,
} from "./question-runtime.repository.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const BANK_ID = "22222222-2222-4222-8222-222222222222";

/** 创建支持 Repository 链式调用的固定响应。 */
function queryResult(value: unknown): QuestionRuntimeDatabaseQuery {
  const query: QuestionRuntimeDatabaseQuery = {
    select() { return query; },
    eq() { return query; },
    order() { return query; },
    single() { return query; },
    then(onfulfilled, onrejected) {
      return Promise.resolve({ data: value, error: null }).then(onfulfilled, onrejected);
    },
  };
  return query;
}

test("runtime repository restores legacy plans without selection audit fields", async () => {
  const session = {
    agent_config: {
      experienceMode: "coaching",
      interviewMode: "text",
      position: "后端工程师",
      difficulty: "中级",
      questionCount: 3,
      jobDescription: null,
      targetCompany: null,
      skillId: null,
      resumeId: null,
      modelProvider: "deepseek",
      modelName: "deepseek-v4-flash",
      webResearch: false,
      promptVersion: "agent-v3-test",
    },
    agent_plan: {
      version: "plan-v3",
      rolePlan: [{
        stageIndex: 0,
        roleId: "general",
        questionCount: 3,
        startQuestionIndex: 0,
        endQuestionIndex: 2,
      }],
      capabilityBlueprint: {
        version: "capability-v1",
        questionCount: 3,
        dimensions: [{
          key: "technical_depth",
          label: "技术深度",
          source: "universal",
          weight: 1,
          targetQuestionCount: 3,
          evidenceHints: [],
        }],
      },
      questionRoles: ["general", "general", "general"],
      questionDimensions: ["technical_depth", "technical_depth", "technical_depth"],
      questionApplicableDimensions: [["technical_depth"], ["technical_depth"], ["technical_depth"]],
      questionEvidenceGoals: [["action"], ["action"], ["action"]],
      firstQuestion: {
        id: BANK_ID,
        question: "请介绍一个后端项目。",
        position: "后端工程师",
        difficulty: "中级",
        type: "技术题",
        tags: ["technical_depth"],
        roleIds: ["general"],
        dimensionKeys: ["technical_depth"],
        topicKeys: ["backend"],
        evidenceGoalKeys: ["action"],
        source: "bank",
      },
      researchStatus: "skipped",
      researchSources: [],
    },
  };
  const database: QuestionRuntimeDatabaseClient = {
    from(table) {
      return queryResult(table === "interview_sessions" ? session : []);
    },
    rpc() {
      return Promise.resolve({ data: null, error: null });
    },
  };
  const repository = new SupabaseQuestionRuntimeRepository(database);
  const context = await repository.loadContext(SESSION_ID);
  assert.equal(context.plan.firstQuestion.questionFamilyKey, `legacy-${BANK_ID}`);
  assert.equal(context.plan.firstQuestion.selectionTier, "bank_exact");
  assert.equal(context.plan.firstQuestion.selectionScore, null);
  assert.equal(context.plan.firstQuestion.selectionReasonCode, "legacy_plan");
});
