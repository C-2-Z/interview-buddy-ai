/** Interview Agent Phase 1 Graph、MemorySaver 恢复与 checkpoint 安全边界测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  INTERRUPT,
  MemorySaver,
  isInterrupted,
} from "@langchain/langgraph";
import { getRolePersona } from "../roles/personas.js";
import { CreateAgentSessionSchema } from "../interview-agent.schemas.js";
import { DeterministicMockAgentModelProvider } from "../providers/agent-model.provider.js";
import type { AgentInputRepository } from "../input/input.repository.js";
import type { QuestionRuntimeService } from "../runtime/question-runtime.service.js";
import type { QuestionEvaluationRunner } from "../evaluation/evaluation.service.js";
import type { AgentReportFinalizer } from "../report/report.service.js";
import {
  AGENT_CHECKPOINT_NAMESPACE,
  createAgentRuntimeCheckpointer,
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

test("web research uses the available safe provider by default", () => {
  const state = createInitialAgentState({
    sessionId: SESSION_ID,
    userId: USER_ID,
    input: CreateAgentSessionSchema.parse({
      mode: "single",
      interviewMode: "text",
      position: "后端工程师",
      difficulty: "中级",
      questionCount: 3,
    }),
  });
  assert.equal(state.config.webResearch, true);
});

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

test("panel graph advances through every frozen role and question", async () => {
  const questionIds = [
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555",
  ];
  const inputIds = ["panel-input-1", "panel-input-2", "panel-input-3"];
  const inputRepository: AgentInputRepository = {
    async acceptInput() { throw new Error("service owns input receipts"); },
    async commitInterviewerResponse() { throw new Error("sufficient answers need no follow-up"); },
    async loadInput(_sessionId, inputId) {
      const index = inputIds.indexOf(inputId);
      if (index < 0) throw new Error("unknown input");
      return {
        inputId,
        messageId: `${index + 6}6666666-6666-4666-8666-666666666666`.slice(-36),
        questionId: questionIds[index],
        question: "请说明一次具体的问题解决经历。",
        content: "我先分析日志和业务指标，定位到数据库索引缺失，随后增加联合索引并完成压测，最终 P95 延迟从 800 毫秒降低到 120 毫秒。",
        source: "text",
        createdAt: "2026-07-12T00:00:00.000Z",
      };
    },
  };
  const selections: Array<{ questionIndex: number; roleId: string }> = [];
  const questionRuntimeService: QuestionRuntimeService = {
    async selectAndCommit(input) {
      selections.push({ questionIndex: input.questionIndex, roleId: input.roleId });
      return {
        questionId: questionIds[input.questionIndex],
        roleId: input.roleId,
        dimensionKey: `dimension-${input.questionIndex}`,
      };
    },
  };
  const evaluated: string[] = [];
  const evaluationService: QuestionEvaluationRunner = {
    async evaluateAndCommit(_sessionId, questionId) {
      evaluated.push(questionId);
      return {
        committed: true,
        duplicate: false,
        operationKey: `evaluate:${questionId}`,
        questionId,
        overallScore: 80,
        eventSequence: evaluated.length,
        evidenceIds: ["77777777-7777-4777-8777-777777777777"],
      };
    },
  };
  let reports = 0;
  const reportService: AgentReportFinalizer = {
    async finalize(sessionId) {
      reports += 1;
      return { committed: true, duplicate: false, operationKey: "finalize:report", sessionId, overallScore: 80, eventSequence: 10 };
    },
  };
  const checkpointer = new MemorySaver();
  const graph = compileInterviewAgentGraph({
    checkpointer,
    inputRepository,
    questionRuntimeService,
    evaluationService,
    reportService,
  });
  const config = createAgentGraphConfig(SESSION_ID);
  const initial = createInitialAgentState({
    sessionId: SESSION_ID,
    userId: USER_ID,
    preparedQuestionId: questionIds[0],
    input: {
      mode: "panel",
      interviewMode: "text",
      position: "后端工程师",
      difficulty: "中级",
      questionCount: 3,
      webResearch: false,
    },
  });

  let state = await graph.invoke(initial, config);
  assert.equal(state.currentRole, "technical");
  state = await graph.invoke(createAgentResumeCommand(inputIds[0]), config);
  assert.equal(state.phase, "awaiting_answer");
  assert.equal(state.currentRole, "manager");
  state = await graph.invoke(createAgentResumeCommand(inputIds[1]), config);
  assert.equal(state.phase, "awaiting_answer");
  assert.equal(state.currentRole, "hr");
  state = await graph.invoke(createAgentResumeCommand(inputIds[2]), config);
  assert.equal(state.phase, "completed");
  assert.deepEqual(selections, [
    { questionIndex: 1, roleId: "manager" },
    { questionIndex: 2, roleId: "hr" },
  ]);
  assert.deepEqual(evaluated, questionIds);
  assert.equal(reports, 1);
  assert.equal((await serializeThreadCheckpoints(checkpointer)).includes("P95 延迟"), false);
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
  await (saver as any).end();
});

test("runtime checkpointer allows explicit memory mode only outside production", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAllowMemory = process.env.AGENT_ALLOW_MEMORY_CHECKPOINTER;
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    delete process.env.DATABASE_URL;
    process.env.AGENT_ALLOW_MEMORY_CHECKPOINTER = "1";
    process.env.NODE_ENV = "development";
    assert.ok(createAgentRuntimeCheckpointer());

    process.env.NODE_ENV = "production";
    assert.throws(
      () => createAgentRuntimeCheckpointer(),
      /DATABASE_URL is required/,
    );
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalAllowMemory === undefined) {
      delete process.env.AGENT_ALLOW_MEMORY_CHECKPOINTER;
    } else {
      process.env.AGENT_ALLOW_MEMORY_CHECKPOINTER = originalAllowMemory;
    }
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});
