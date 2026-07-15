/** Agent 工作台单次 RPC、显式映射和 v1/v2 恢复兼容测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentWorkspaceRepository,
  type WorkspaceDatabaseClient,
} from "./workspace.repository.js";
import { AgentWorkspaceService } from "./workspace.service.js";
import type { AgentWorkspace } from "./workspace.types.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const QUESTION_ID = "22222222-2222-4222-8222-222222222222";

/** 构造可被严格契约校验的完整工作台投影。 */
function buildWorkspace(): AgentWorkspace {
  return {
    productStatus: "completed",
    snapshot: {
      sessionId: SESSION_ID,
      threadId: SESSION_ID,
      version: "agent-v3",
      mode: "single",
      interviewMode: "text",
      phase: "completed",
      currentRole: "general",
      currentQuestionId: QUESTION_ID,
      currentQuestionIndex: 0,
      followUpCount: 0,
      pendingAction: "finish",
      eventCursor: 8,
      strategyRevision: 1,
    },
    config: {
      position: "后端工程师",
      difficulty: "高级",
      questionCount: 1,
      targetCompany: "示例公司",
      experienceMode: "coaching",
    },
    research: {
      status: "completed",
      sources: [{
        id: "44444444-4444-4444-8444-444444444444",
        category: "company",
        title: "公司工程博客",
        url: "https://example.test",
      }],
    },
    strategy: {
      revision: 1,
      objective: "验证高级后端工程能力",
      focusDimensions: ["technical_depth"],
      memoryApplied: false,
      brainApplied: false,
    },
    activities: [{
      id: "66666666-6666-4666-8666-666666666666",
      kind: "planning",
      status: "completed",
      label: "制定面试策略",
    }],
    questions: [{
      id: QUESTION_ID,
      question: "说明一次性能优化",
      orderIndex: 0,
      roleId: "technical",
      dimensionKey: "technical_depth",
      source: "model",
      score: 91,
      feedback: "清晰",
      messages: [{
        id: "33333333-3333-4333-8333-333333333333",
        role: "user",
        content: "P95 降到 120ms",
        source: "voice",
        interrupted: false,
        createdAt: new Date(0).toISOString(),
      }],
      evidence: [{
        id: "55555555-5555-4555-8555-555555555555",
        dimensionKey: "technical_depth",
        claim: "量化优化",
        quote: "P95 降到 120ms",
      }],
      evaluation: {
        overallScore: 91,
        dimensions: {
          technical_depth: {
            status: "scored",
            score: 91,
            rationale: "有量化证据",
            evidenceIds: ["55555555-5555-4555-8555-555555555555"],
          },
        },
      },
    }],
    report: {
      overallScore: 91,
      overallFeedback: "证据充分",
      dimensionSummary: { overallScore: 91 },
    },
  };
}

test("workspace restores the full projection with one database RPC", async () => {
  let rpcCalls = 0;
  const database: WorkspaceDatabaseClient = {
    rpc(name, parameters) {
      rpcCalls += 1;
      assert.equal(name, "get_agent_v3_workspace");
      assert.deepEqual(parameters, { p_session_id: SESSION_ID });
      return Promise.resolve({ data: buildWorkspace(), error: null });
    },
  };

  const workspace = await new AgentWorkspaceRepository(database).load(SESSION_ID);
  assert.equal(rpcCalls, 1);
  assert.equal(workspace.questions[0].messages[0].source, "voice");
  assert.equal(workspace.questions[0].evidence[0].quote, "P95 降到 120ms");
  assert.equal(workspace.questions[0].evaluation?.overallScore, 91);
  assert.equal(workspace.strategy?.revision, 1);
  assert.equal(workspace.activities[0].kind, "planning");
});

test("simulation workspace hides process details until completion", async () => {
  const workspace = buildWorkspace();
  workspace.productStatus = "in_progress";
  workspace.snapshot.phase = "awaiting_answer";
  workspace.config.experienceMode = "simulation";
  const service = new AgentWorkspaceService({
    async load() {
      return workspace;
    },
  });

  const restored = await service.load(SESSION_ID);
  assert.equal(restored.snapshot.version, "agent-v3");
  assert.equal(restored.strategy, null);
  assert.deepEqual(restored.activities, []);
  assert.equal(restored.questions[0].score, null);
  assert.equal(restored.report, null);
});
