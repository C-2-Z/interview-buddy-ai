/** Agent v2 Graph 单元测试：验证独立命名空间、策略引用和安全 checkpoint。 */
import assert from "node:assert/strict";
import test from "node:test";
import { MemorySaver, isInterrupted } from "@langchain/langgraph";
import type { AgentOrchestrationRunner } from "../../agent-orchestration/agent-orchestration.types.js";
import { AGENT_V2_CHECKPOINT_NAMESPACE } from "./checkpointer.js";
import {
  compileInterviewAgentV2Graph,
  createAgentGraphConfig,
  createInitialAgentState,
} from "./interview-agent.graph.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

test("v2 plans before waiting and stores references instead of model reasoning", async () => {
  const checkpointer = new MemorySaver();
  let planCalls = 0;
  const orchestration: AgentOrchestrationRunner = {
    async planSession() {
      planCalls += 1;
      return {
        strategyRevisionId: "33333333-3333-4333-8333-333333333333",
        revision: 1,
        questionIntent: "验证候选人的技术决策证据",
        observationIds: ["44444444-4444-4444-8444-444444444444"],
        memoryApplied: false,
        brainApplied: false,
      };
    },
    async reflect() { throw new Error("not reached before first interrupt"); },
    async decideResponse() { return { action: "score", reasonCode: "enough", followUpQuestion: null }; },
    async updateTrainingMemory() { return false; },
  };
  const graph = compileInterviewAgentV2Graph({ checkpointer, orchestrationService: orchestration });
  const config = createAgentGraphConfig(SESSION_ID, "agent-v2");
  assert.equal(config.configurable?.checkpoint_ns, AGENT_V2_CHECKPOINT_NAMESPACE);
  const state = await graph.invoke(createInitialAgentState({
    sessionId: SESSION_ID,
    userId: USER_ID,
    version: "agent-v2",
    capabilityDimensions: ["communication", "technical_depth"],
    input: {
      mode: "single",
      interviewMode: "text",
      position: "后端工程师",
      difficulty: "中级",
      questionCount: 3,
      webResearch: false,
    },
  }), config);
  assert.equal(isInterrupted(state), true);
  assert.equal(planCalls, 1);
  assert.equal(state.strategyRevisionId, "33333333-3333-4333-8333-333333333333");
  assert.deepEqual(state.observationIds, ["44444444-4444-4444-8444-444444444444"]);
  assert.equal(state.currentQuestionIntent, "验证候选人的技术决策证据");

  const serialized: string[] = [];
  for await (const tuple of checkpointer.list(config)) serialized.push(JSON.stringify(tuple.checkpoint));
  const checkpointText = serialized.join("\n");
  assert.equal(checkpointText.includes("chainOfThought"), false);
  assert.equal(checkpointText.includes("apiKey"), false);
  assert.equal(checkpointText.includes("rawToolResult"), false);
});
