/** Interview Agent Phase 1 Graph、MemorySaver 恢复与 checkpoint 安全边界测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  INTERRUPT,
  MemorySaver,
  isInterrupted,
} from "@langchain/langgraph";
import { getRolePersona } from "../roles/personas.js";
import { DeterministicMockAgentModelProvider } from "../providers/agent-model.provider.js";
import {
  AGENT_CHECKPOINT_NAMESPACE,
  createPostgresCheckpointer,
  resolveAgentCheckpointSchema,
} from "./checkpointer.js";
import {
  compileInterviewAgentGraph,
  createAgentGraphConfig,
  createAgentResumeCommand,
  createAgentSnapshot,
  createInitialAgentState,
} from "./interview-agent.graph.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

/**
 * 构建单元测试共用的无敏感信息初始状态。
 *
 * @returns 三题单面试官文本会话的 Phase 1 初始状态。
 */
function buildTestState() {
  return createInitialAgentState({
    sessionId: SESSION_ID,
    userId: USER_ID,
    input: {
      mode: "single",
      interviewMode: "text",
      position: "后端工程师",
      difficulty: "中级",
      questionCount: 3,
      webResearch: false,
    },
  });
}

/**
 * 将某线程的全部 MemorySaver checkpoint 展开为可检索文本。
 *
 * @param checkpointer - 已运行 Graph 使用的内存 saver。
 * @returns 包含全部历史 checkpoint、metadata 与 pending writes 的 JSON 文本。
 */
async function serializeThreadCheckpoints(
  checkpointer: MemorySaver,
): Promise<string> {
  const serialized: string[] = [];
  for await (const tuple of checkpointer.list(createAgentGraphConfig(SESSION_ID))) {
    serialized.push(
      JSON.stringify({
        checkpoint: tuple.checkpoint,
        metadata: tuple.metadata,
        pendingWrites: tuple.pendingWrites,
      }),
    );
  }
  return serialized.join("\n");
}

test("deterministic model adapter returns identical structured questions", async () => {
  const provider = new DeterministicMockAgentModelProvider();
  const input = {
    sessionId: SESSION_ID,
    questionIndex: 0,
    roleId: "general" as const,
    persona: getRolePersona("general"),
    position: "后端工程师",
    difficulty: "中级" as const,
    promptVersion: "agent-v1",
  };

  const first = await provider.generateQuestion(input);
  const second = await provider.generateQuestion(input);
  assert.deepEqual(second, first);
  assert.equal(first.questionId, `mock:${SESSION_ID}:general:1`);
  assert.match(first.content, /后端工程师/);
});

test("MemorySaver interrupts, resumes by inputId, and reaches completed state", async () => {
  const checkpointer = new MemorySaver();
  const graph = compileInterviewAgentGraph({ checkpointer });
  const config = createAgentGraphConfig(SESSION_ID);

  assert.equal(config.configurable?.thread_id, SESSION_ID);
  assert.equal(
    config.configurable?.checkpoint_ns,
    AGENT_CHECKPOINT_NAMESPACE,
  );

  const interruptedResult = await graph.invoke(buildTestState(), config);
  assert.equal(interruptedResult.phase, "awaiting_answer");
  assert.equal(interruptedResult.currentQuestionId, `mock:${SESSION_ID}:general:1`);
  assert.equal(isInterrupted(interruptedResult), true);
  if (!isInterrupted(interruptedResult)) {
    throw new Error("Expected the Phase 1 graph to interrupt");
  }
  assert.deepEqual(interruptedResult[INTERRUPT][0].value, {
    type: "agent.input.required",
    sessionId: SESSION_ID,
    questionId: `mock:${SESSION_ID}:general:1`,
    resumeWith: "inputId",
  });

  const interruptedState = await graph.getState(config);
  assert.deepEqual(interruptedState.next, ["wait_for_input"]);

  const finalResult = await graph.invoke(
    createAgentResumeCommand("input-001"),
    config,
  );
  assert.equal(finalResult.phase, "completed");
  assert.equal(finalResult.latestInputId, "input-001");
  assert.equal(finalResult.pendingAction, "finish");

  const finalState = await graph.getState(config);
  assert.deepEqual(finalState.next, []);
  assert.equal(finalState.values.phase, "completed");
  assert.equal(finalState.values.latestInputId, "input-001");

  const snapshot = createAgentSnapshot(finalState.values, 7);
  assert.equal(snapshot.threadId, SESSION_ID);
  assert.equal(snapshot.phase, "completed");
  assert.equal(snapshot.eventCursor, 7);
});

test("state and every MemorySaver checkpoint omit answer content and credentials", async () => {
  const answerContent = "SENSITIVE_ANSWER_CONTENT_NEVER_CHECKPOINTED";
  const apiKey = "sk-SENSITIVE_API_KEY_NEVER_CHECKPOINTED";
  const authorization = "Bearer SENSITIVE_AUTHORIZATION_NEVER_CHECKPOINTED";
  const checkpointer = new MemorySaver();
  const graph = compileInterviewAgentGraph({ checkpointer });
  const config = createAgentGraphConfig(SESSION_ID);
  const initialState = buildTestState();

  // Phase 3 的 API 会先把 answerContent 写入业务消息表；Graph 只接收其 inputId。
  assert.equal("content" in initialState, false);
  assert.equal("apiKey" in initialState, false);
  assert.equal("authorization" in initialState, false);
  assert.equal("apiKey" in initialState.config, false);

  await graph.invoke(initialState, config);
  await graph.invoke(createAgentResumeCommand("input-sensitive-boundary"), config);

  const finalState = await graph.getState(config);
  const stateText = JSON.stringify(finalState.values);
  const checkpointText = await serializeThreadCheckpoints(checkpointer);
  for (const forbidden of [answerContent, apiKey, authorization]) {
    assert.equal(stateText.includes(forbidden), false);
    assert.equal(checkpointText.includes(forbidden), false);
  }
  assert.equal(stateText.includes('"content"'), false);
  assert.equal(checkpointText.includes('"apiKey"'), false);
  assert.equal(checkpointText.includes('"authorization"'), false);
});

test("checkpoint schema validation is strict and runtime factory does not setup", async () => {
  for (const valid of ["langgraph", "agent_v1", "_private2"]) {
    assert.equal(resolveAgentCheckpointSchema(valid), valid);
  }
  for (const invalid of [
    "",
    "LangGraph",
    "agent-v1",
    "1agent",
    " langgraph",
    "langgraph ",
    "langgraph;drop schema public",
  ]) {
    assert.throws(() => resolveAgentCheckpointSchema(invalid));
  }

  const saver = createPostgresCheckpointer({
    connectionString: "postgresql://agent:agent@127.0.0.1:5432/agent",
    schema: "agent_v1",
  });
  assert.equal(
    (saver as unknown as { isSetup: boolean }).isSetup,
    false,
    "runtime factory must not execute setup() or DDL",
  );
  await saver.end();
});
