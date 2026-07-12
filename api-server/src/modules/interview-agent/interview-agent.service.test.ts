/** Interview Agent Service 的创建、幂等恢复和 checkpoint 安全测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import { MemorySaver } from "@langchain/langgraph";
import type { AgentRuntimeConfig } from "./interview-agent.config.js";
import type { CreateAgentSessionRepositoryInput } from "./interview-agent.repository.js";
import type {
  AgentEventDraft,
  AgentOperationClaim,
  AgentOperationCommit,
  AgentOperationFailure,
  AgentSessionProjection,
  CommitAgentOperationInput,
  FailAgentOperationInput,
  InterviewAgentRepository,
  SafeAgentJsonObject,
} from "./interview-agent.repository.js";
import {
  InterviewAgentService,
  InterviewAgentServiceError,
} from "./interview-agent.service.js";
import type {
  AgentEvent,
  AgentSnapshot,
  CreateAgentSessionResponse,
} from "./interview-agent.types.js";
import {
  compileInterviewAgentGraph,
  createAgentGraphConfig,
} from "./graph/interview-agent.graph.js";
import { DisabledWebSearchProvider } from "./providers/web-search.provider.js";
import type { InterviewAgentTools } from "./tools/interview-agent.tools.js";
import type {
  CommitPreparationInput,
  PreparationCommitRepository,
} from "./tools/preparation.repository.js";
import { InterviewPreparationService } from "./tools/preparation.service.js";
import type { AgentInputRepository } from "./input/input.repository.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const CREATED_AT = "2026-07-12T00:00:00.000Z";

/** 测试使用的无网络 Agent 运行配置。 */
const ENABLED_RUNTIME: AgentRuntimeConfig = {
  enabled: true,
  promptVersion: "agent-v1-test",
  webResearchEnabled: false,
  eventRetentionDays: 90,
  maxNodeRetries: 2,
  webResearchTimeoutMs: 10_000,
};

/** 内存幂等记录。 */
type MemoryOperation = {
  /** 节点名称。 */
  nodeName: string;
  /** 当前状态。 */
  status: "running" | "completed" | "failed";
  /** 完成结果。 */
  result: SafeAgentJsonObject | null;
  /** 首事件序号。 */
  firstEventSequence: number | null;
  /** 尾事件序号。 */
  lastEventSequence: number | null;
  /** 失败错误码。 */
  errorCode: string | null;
};

/** 精确模拟 create/claim/commit/fail 与已提交事件的内存 Repository。 */
class MemoryInterviewAgentRepository implements InterviewAgentRepository {
  /** 所有已提交事件。 */
  readonly events: AgentEvent[] = [];
  /** 幂等操作账本。 */
  readonly operations = new Map<string, MemoryOperation>();
  /** Graph resume 成功提交次数。 */
  inputCommitCount = 0;
  /** 已 receipt 的 inputId 与消息 UUID。 */
  readonly acceptedInputs = new Map<string, string>();
  /** 当前题目追问次数。 */
  private followUpCount = 0;
  /** 当前会话投影。 */
  private projection: AgentSessionProjection | null = null;

  /** @inheritdoc */
  async createSession(
    input: CreateAgentSessionRepositoryInput,
  ): Promise<CreateAgentSessionResponse> {
    const currentRole = input.mode === "panel" ? "technical" : "general";
    this.projection = {
      sessionId: SESSION_ID,
      userId: USER_ID,
      threadId: SESSION_ID,
      version: "agent-v1",
      mode: input.mode,
      interviewMode: input.interviewMode,
      phase: "preparing",
      currentRole,
      agentConfig: {
        interviewMode: input.interviewMode,
        position: input.position,
        difficulty: input.difficulty,
        questionCount: input.questionCount,
        jobDescription: input.jobDescription ?? null,
        targetCompany: input.targetCompany ?? null,
        skillId: input.skillId ?? null,
        resumeId: input.resumeId ?? null,
        modelProvider: input.modelProvider ?? "deepseek",
        modelName: input.modelName ?? "deepseek-v4-flash",
        webResearch: input.webResearch ?? false,
        promptVersion: input.promptVersion,
      },
      researchStatus: input.webResearch ? "pending" : "skipped",
      eventCursor: 1,
    };
    const snapshot: AgentSnapshot = {
      sessionId: SESSION_ID,
      threadId: SESSION_ID,
      version: "agent-v1",
      mode: input.mode,
      interviewMode: input.interviewMode,
      phase: "preparing",
      currentRole,
      currentQuestionId: null,
      currentQuestionIndex: 0,
      followUpCount: 0,
      pendingAction: "ask",
      eventCursor: 1,
    };
    this.events.push({
      sequence: 1,
      type: "agent.snapshot",
      data: snapshot,
      createdAt: CREATED_AT,
    });
    return {
      sessionId: SESSION_ID,
      threadId: SESSION_ID,
      phase: "preparing",
      eventCursor: 1,
    };
  }

  /** @inheritdoc */
  async getOwnedSessionProjection(): Promise<AgentSessionProjection> {
    if (!this.projection) throw new Error("missing session");
    return structuredClone(this.projection);
  }

  /** @inheritdoc */
  async claimOperation(input: {
    sessionId: string;
    operationKey: string;
    nodeName: string;
  }): Promise<AgentOperationClaim> {
    const existing = this.operations.get(input.operationKey);
    if (existing?.status === "completed") {
      return {
        claimed: false,
        duplicate: true,
        inProgress: false,
        status: "completed",
        operationKey: input.operationKey,
        nodeName: existing.nodeName,
        result: existing.result,
        firstEventSequence: existing.firstEventSequence,
        lastEventSequence: existing.lastEventSequence,
      };
    }
    if (existing?.status === "running") {
      return {
        claimed: false,
        duplicate: false,
        inProgress: true,
        status: "running",
        operationKey: input.operationKey,
        nodeName: existing.nodeName,
        result: null,
        firstEventSequence: null,
        lastEventSequence: null,
      };
    }
    this.operations.set(input.operationKey, {
      nodeName: input.nodeName,
      status: "running",
      result: null,
      firstEventSequence: null,
      lastEventSequence: null,
      errorCode: null,
    });
    return {
      claimed: true,
      duplicate: false,
      inProgress: false,
      status: "running",
      operationKey: input.operationKey,
      nodeName: input.nodeName,
      result: null,
      firstEventSequence: null,
      lastEventSequence: null,
    };
  }

  /** @inheritdoc */
  async commitOperation(
    input: CommitAgentOperationInput,
  ): Promise<AgentOperationCommit> {
    if (!this.projection) throw new Error("missing session");
    const existing = this.operations.get(input.operationKey);
    if (!existing || existing.status !== "running") {
      throw new Error("operation must be claimed");
    }
    const firstEventSequence = this.projection.eventCursor + 1;
    for (const draft of input.events) {
      const sequence = this.projection.eventCursor + 1;
      this.events.push(this.commitDraft(draft, sequence));
      this.projection.eventCursor = sequence;
    }
    this.projection.phase = input.phase;
    this.projection.currentRole = input.currentRole;
    existing.status = "completed";
    existing.result = structuredClone(input.result) as SafeAgentJsonObject;
    existing.firstEventSequence = firstEventSequence;
    existing.lastEventSequence = this.projection.eventCursor;
    if (input.operationKey.startsWith("input:")) this.inputCommitCount += 1;
    return {
      committed: true,
      duplicate: false,
      inProgress: false,
      status: "completed",
      operationKey: input.operationKey,
      nodeName: input.nodeName,
      result: existing.result,
      firstEventSequence,
      lastEventSequence: this.projection.eventCursor,
    };
  }

  /** @inheritdoc */
  async failOperation(
    input: FailAgentOperationInput,
  ): Promise<AgentOperationFailure> {
    const existing = this.operations.get(input.operationKey);
    if (!existing) throw new Error("missing operation");
    if (existing.status === "completed") {
      return {
        failed: false,
        duplicate: true,
        status: "completed",
        operationKey: input.operationKey,
        result: existing.result ?? {},
        firstEventSequence: existing.firstEventSequence ?? 1,
        lastEventSequence: existing.lastEventSequence ?? 1,
      };
    }
    existing.status = "failed";
    existing.errorCode = input.errorCode;
    return {
      failed: true,
      duplicate: false,
      status: "failed",
      operationKey: input.operationKey,
      errorCode: input.errorCode,
    };
  }

  /**
   * 模拟 `accept_agent_input` 在一个事务保存用户消息事件并把投影推进到 reasoning。
   *
   * @param input - Phase 3 输入 receipt。
   * @returns 首次或重复 receipt。
   */
  async acceptInput(
    input: Parameters<AgentInputRepository["acceptInput"]>[0],
  ): ReturnType<AgentInputRepository["acceptInput"]> {
    if (!this.projection) throw new Error("missing session");
    const existing = this.acceptedInputs.get(input.inputId);
    const questionId = this.getCurrentQuestionId();
    if (existing) {
      return {
        accepted: false,
        duplicate: true,
        operationKey: `receive:${input.inputId}`,
        messageId: existing,
        questionId,
        eventSequence: this.projection.eventCursor,
      };
    }
    if (this.projection.phase !== "awaiting_answer") {
      throw new Error("not awaiting input");
    }
    const messageId = "88888888-8888-4888-8888-888888888888";
    const sequence = this.projection.eventCursor + 1;
    this.acceptedInputs.set(input.inputId, messageId);
    this.events.push({
      sequence,
      type: "agent.message_completed",
      data: {
        id: messageId,
        role: "user",
        content: input.content,
        roleId: this.projection.currentRole,
        createdAt: CREATED_AT,
        interrupted: false,
      },
      createdAt: CREATED_AT,
    });
    this.projection.phase = "reasoning";
    this.projection.eventCursor = sequence;
    return {
      accepted: true,
      duplicate: false,
      operationKey: `receive:${input.inputId}`,
      messageId,
      questionId,
      eventSequence: sequence,
    };
  }

  /** @inheritdoc */
  async loadInput(sessionId: string, inputId: string) {
    if (sessionId !== SESSION_ID) throw new Error("session mismatch");
    const messageId = this.acceptedInputs.get(inputId);
    const event = this.events.find(
      (candidate) =>
        candidate.type === "agent.message_completed" &&
        candidate.data.id === messageId,
    );
    if (!messageId || event?.type !== "agent.message_completed") {
      throw new Error("missing input");
    }
    return {
      inputId,
      messageId,
      questionId: this.getCurrentQuestionId(),
      question: "测试题目",
      content: event.data.content,
      source: "text" as const,
      createdAt: event.data.createdAt,
    };
  }

  /** @inheritdoc */
  async commitInterviewerResponse(
    input: Parameters<AgentInputRepository["commitInterviewerResponse"]>[0],
  ): ReturnType<AgentInputRepository["commitInterviewerResponse"]> {
    if (!this.projection || this.projection.phase !== "reasoning") {
      throw new Error("not reasoning");
    }
    const messageId = "99999999-9999-4999-8999-999999999999";
    const sequence = this.projection.eventCursor + 1;
    this.events.push({
      sequence,
      type: "agent.message_completed",
      data: {
        id: messageId,
        role: "assistant",
        content: input.content,
        roleId: this.projection.currentRole,
        createdAt: CREATED_AT,
        interrupted: false,
      },
      createdAt: CREATED_AT,
    });
    this.projection.phase = "awaiting_answer";
    this.projection.eventCursor = sequence;
    if (input.responseType === "follow_up") this.followUpCount += 1;
    return {
      committed: true,
      duplicate: false,
      operationKey: `respond:${input.inputId}:${input.responseType}`,
      messageId,
      questionId: this.getCurrentQuestionId(),
      responseType: input.responseType,
      followUpCount: this.followUpCount,
      eventSequence: sequence,
    };
  }

  /** @inheritdoc */
  async listEventsAfter(
    _sessionId: string,
    afterSequence: number,
    limit: number,
  ): Promise<AgentEvent[]> {
    return this.events
      .filter((event) => event.sequence > afterSequence)
      .slice(0, limit)
      .map((event) => structuredClone(event));
  }

  /** @inheritdoc */
  async getLatestSnapshotEvent(): Promise<AgentEvent> {
    const event = [...this.events]
      .reverse()
      .find((candidate) => candidate.type === "agent.snapshot");
    if (!event) throw new Error("missing snapshot");
    return structuredClone(event);
  }

  /**
   * 为事件草稿分配数据库序号，并模拟 RPC 对 snapshot.eventCursor 的覆盖。
   *
   * @param draft - 尚无数据库元数据的事件。
   * @param sequence - 会话内新序号。
   * @returns 已提交事件。
   */
  private commitDraft(draft: AgentEventDraft, sequence: number): AgentEvent {
    if (draft.type === "agent.snapshot") {
      const data = structuredClone(draft.data) as AgentSnapshot;
      data.eventCursor = sequence;
      return {
        type: draft.type,
        sequence,
        data,
        createdAt: CREATED_AT,
      };
    }
    return {
      ...draft,
      sequence,
      data: structuredClone(draft.data),
      createdAt: CREATED_AT,
    } as AgentEvent;
  }

  /** 返回最新 Snapshot 引用的非空题目 UUID。 */
  private getCurrentQuestionId(): string {
    const snapshot = [...this.events]
      .reverse()
      .find((event) => event.type === "agent.snapshot");
    if (snapshot?.type !== "agent.snapshot" || !snapshot.data.currentQuestionId) {
      throw new Error("missing current question");
    }
    return snapshot.data.currentQuestionId;
  }
}

/** 创建使用真实 Graph/MemorySaver 和内存业务 Repository 的 Service。 */
function createHarness(
  runtime: AgentRuntimeConfig = ENABLED_RUNTIME,
  persistInputs = false,
) {
  const checkpointer = new MemorySaver();
  const repository = new MemoryInterviewAgentRepository();
  const graph = compileInterviewAgentGraph({
    checkpointer,
    inputRepository: persistInputs ? repository : undefined,
  });
  const service = new InterviewAgentService({
    repository,
    userId: USER_ID,
    getGraph: () => graph,
    runtimeConfig: runtime,
    inputRepository: persistInputs ? repository : undefined,
    async resolveModel() {
      return { name: "deepseek", model: "deepseek-v4-flash" };
    },
  });
  return { checkpointer, graph, repository, service };
}

/** Phase 1 共用的创建请求。 */
const CREATE_INPUT = {
  mode: "single",
  interviewMode: "text",
  position: "后端工程师",
  difficulty: "中级",
  questionCount: 3,
  webResearch: true,
} as const;

test("disabled Agent creation never falls back to legacy writes", async () => {
  const harness = createHarness({ ...ENABLED_RUNTIME, enabled: false });
  await assert.rejects(
    harness.service.createSession(CREATE_INPUT),
    (error: unknown) => {
      assert.ok(error instanceof InterviewAgentServiceError);
      assert.equal(error.code, "agent_interview_disabled");
      return true;
    },
  );
  assert.equal(harness.repository.events.length, 0);
});

test("create reaches durable awaiting_answer snapshot at the interrupt", async () => {
  const harness = createHarness();
  const created = await harness.service.createSession(CREATE_INPUT);
  const view = await harness.service.getSession(created.sessionId);

  assert.equal(created.phase, "preparing");
  assert.equal(created.eventCursor, 1);
  assert.equal(view.snapshot.phase, "awaiting_answer");
  assert.equal(view.snapshot.currentQuestionId, `mock:${SESSION_ID}:general:1`);
  assert.equal(view.snapshot.eventCursor, 3);
  assert.deepEqual(
    (await harness.graph.getState(createAgentGraphConfig(SESSION_ID))).next,
    ["wait_for_input"],
  );
});

test("Phase 2 preparation commits the bank-first question and snapshot atomically", async () => {
  const checkpointer = new MemorySaver();
  const graph = compileInterviewAgentGraph({ checkpointer });
  const repository = new MemoryInterviewAgentRepository();
  const bankQuestionId = "33333333-3333-4333-8333-333333333333";
  const tools: InterviewAgentTools = {
    async loadSkill() { return null; },
    async loadResumeSummary() { return null; },
    async searchQuestionBank() {
      return [{
        id: bankQuestionId,
        question: "请说明一次数据库索引优化的完整过程。",
        position: "后端工程师",
        difficulty: "中级",
        type: "技术题",
        tags: ["technical_depth"],
        source: "bank" as const,
      }];
    },
    async loadSessionMessages() { return []; },
    async loadRubric() { return []; },
  };
  let committed: CommitPreparationInput | undefined;
  const preparationRepository: PreparationCommitRepository = {
    async commitPreparation(input) {
      committed = input;
      return repository.commitOperation({
        sessionId: input.sessionId,
        operationKey: input.operationKey,
        nodeName: input.nodeName,
        phase: "awaiting_answer",
        currentRole: input.currentRole,
        result: input.result,
        events: input.events,
      });
    },
  };
  const service = new InterviewAgentService({
    repository,
    preparationRepository,
    preparationService: new InterviewPreparationService({
      tools,
      webSearchProvider: new DisabledWebSearchProvider(),
      modelProvider: { async generateQuestion() { throw new Error("bank question must win"); } },
      async loadResearchSources() { return []; },
    }),
    userId: USER_ID,
    getGraph: () => graph,
    runtimeConfig: ENABLED_RUNTIME,
    async resolveModel() {
      return { name: "deepseek", model: "deepseek-v4-flash" };
    },
  });

  await service.createSession(CREATE_INPUT);
  const questionEvent = repository.events.find(
    (event) => event.type === "agent.question_ready",
  );
  assert.ok(committed);
  assert.equal(committed.question.bankQuestionId, bankQuestionId);
  assert.match(committed.question.id, /^[0-9a-f-]{36}$/);
  assert.equal(questionEvent?.type, "agent.question_ready");
  assert.equal(
    questionEvent?.type === "agent.question_ready" ? questionEvent.data.id : null,
    committed.question.id,
  );
  assert.equal((await service.getSession(SESSION_ID)).snapshot.currentQuestionId, committed.question.id);
});

test("duplicate input returns the first result without resuming twice", async () => {
  const harness = createHarness();
  await harness.service.createSession(CREATE_INPUT);

  const first = await harness.service.submitInput(SESSION_ID, {
    inputId: "answer-001",
    type: "text",
    content: "第一次回答",
  });
  const duplicate = await harness.service.submitInput(SESSION_ID, {
    inputId: "answer-001",
    type: "text",
    content: "网络重试携带的不同正文也不能重复执行",
  });

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(harness.repository.inputCommitCount, 1);
  assert.equal(duplicate.snapshot.phase, "completed");
  assert.equal(duplicate.snapshot.eventCursor, 6);
});

test("answer content never enters state or any MemorySaver checkpoint", async () => {
  const forbiddenContent = "ANSWER_BODY_MUST_STAY_IN_BUSINESS_MESSAGES";
  const harness = createHarness();
  await harness.service.createSession(CREATE_INPUT);
  await harness.service.submitInput(SESSION_ID, {
    inputId: "answer-secure",
    type: "text",
    content: forbiddenContent,
  });

  const serialized: string[] = [];
  for await (const tuple of harness.checkpointer.list(
    createAgentGraphConfig(SESSION_ID),
  )) {
    serialized.push(JSON.stringify(tuple));
  }
  const checkpointText = serialized.join("\n");
  assert.equal(checkpointText.includes(forbiddenContent), false);
  assert.equal(checkpointText.includes("answer-secure"), true);
});

test("Phase 3 persists the candidate message before resuming by inputId", async () => {
  const answerContent = "这段正文只能存在于业务消息和事件中";
  const harness = createHarness(ENABLED_RUNTIME, true);
  await harness.service.createSession(CREATE_INPUT);
  const result = await harness.service.submitInput(SESSION_ID, {
    inputId: "durable-answer-1",
    type: "text",
    content: answerContent,
  });

  assert.equal(harness.repository.acceptedInputs.has("durable-answer-1"), true);
  assert.equal(
    harness.repository.events.some(
      (event) => event.type === "agent.message_completed" && event.data.content === answerContent,
    ),
    true,
  );
  assert.equal(result.snapshot.eventCursor, 7);
  const checkpoints: string[] = [];
  for await (const tuple of harness.checkpointer.list(createAgentGraphConfig(SESSION_ID))) {
    checkpoints.push(JSON.stringify(tuple));
  }
  assert.equal(checkpoints.join("\n").includes(answerContent), false);
  assert.equal(checkpoints.join("\n").includes("durable-answer-1"), true);
});

test("Phase 3 guard redirects copied input and interrupts on the same question", async () => {
  const harness = createHarness(ENABLED_RUNTIME, true);
  await harness.service.createSession(CREATE_INPUT);
  const result = await harness.service.submitInput(SESSION_ID, {
    inputId: "copied-answer-1",
    type: "text",
    content: "测试题目",
  });

  assert.equal(result.snapshot.phase, "awaiting_answer");
  assert.equal(result.snapshot.pendingAction, "follow_up");
  assert.equal(result.snapshot.followUpCount, 0);
  assert.equal(result.snapshot.eventCursor, 7);
  assert.equal(
    harness.repository.events.some(
      (event) =>
        event.type === "agent.message_completed" &&
        event.data.role === "assistant" &&
        event.data.content.includes("不要复述题目"),
    ),
    true,
  );
  const graphState = await harness.graph.getState(
    createAgentGraphConfig(SESSION_ID),
  );
  assert.deepEqual(graphState.next, ["wait_for_input"]);
  assert.equal(JSON.stringify(graphState).includes("测试题目"), false);
});

test("Phase 3 asks at most three follow-ups before leaving the question", async () => {
  const harness = createHarness(ENABLED_RUNTIME, true);
  await harness.service.createSession(CREATE_INPUT);
  for (let index = 1; index <= 3; index += 1) {
    const result = await harness.service.submitInput(SESSION_ID, {
      inputId: `brief-answer-${index}`,
      type: "text",
      content: "我做了优化，但暂时没有更多细节。",
    });
    assert.equal(result.snapshot.phase, "awaiting_answer");
    assert.equal(result.snapshot.followUpCount, index);
  }
  const final = await harness.service.submitInput(SESSION_ID, {
    inputId: "brief-answer-4",
    type: "text",
    content: "我仍然只能补充这些内容。",
  });
  assert.equal(final.snapshot.phase, "completed");
  assert.equal(final.snapshot.followUpCount, 3);
  assert.equal(
    harness.repository.events.filter(
      (event) =>
        event.type === "agent.message_completed" &&
        event.data.role === "assistant",
    ).length,
    3,
  );
});

test("a second concurrent claim cannot invoke the same input operation", async () => {
  const harness = createHarness();
  await harness.service.createSession(CREATE_INPUT);
  const requests = await Promise.allSettled([
    harness.service.submitInput(SESSION_ID, {
      inputId: "answer-concurrent",
      type: "text",
      content: "并发回答",
    }),
    harness.service.submitInput(SESSION_ID, {
      inputId: "answer-concurrent",
      type: "text",
      content: "并发重试",
    }),
  ]);

  assert.equal(
    requests.filter((request) => request.status === "fulfilled").length,
    1,
  );
  const rejected = requests.find(
    (request): request is PromiseRejectedResult => request.status === "rejected",
  );
  assert.ok(rejected?.reason instanceof InterviewAgentServiceError);
  assert.equal(rejected.reason.code, "agent_operation_in_progress");
  assert.equal(harness.repository.inputCommitCount, 1);
});
