/** Interview Agent Repository 的 RPC、查询链、幂等和安全边界单元测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  InterviewAgentRepositoryError,
  SupabaseInterviewAgentRepository,
  type AgentDatabaseClient,
  type AgentDatabaseQuery,
  type CommitAgentOperationInput,
  type CreateAgentSessionRepositoryInput,
} from "./interview-agent.repository.js";

const SESSION_ID = "f34c4bbb-a1bb-43c7-b223-7eb8281f9653";
const USER_ID = "2b2763e8-e1f4-4c22-aad4-83da0a4015b7";
const CREATED_AT = "2026-07-11T08:00:00.000Z";

/** Fake 查询链记录的一次方法调用。 */
type QueryCall = {
  /** 链式方法名。 */
  method: string;
  /** 传给该方法的原始参数。 */
  args: unknown[];
};

/** Fake client 记录的一次 RPC 调用。 */
type RpcCall = {
  /** PostgreSQL function 名称。 */
  functionName: string;
  /** Repository 构造的命名参数。 */
  args: Record<string, unknown>;
};

/** Supabase 查询链的最小可等待 fake，不自行排序数据以检验 Repository 的二次排序。 */
class FakeAgentDatabaseQuery implements AgentDatabaseQuery {
  /**
   * 创建返回固定信封的 fake 查询链。
   *
   * @param response - await 查询时返回的 Supabase 风格信封。
   * @param calls - 共享的方法调用记录。
   */
  constructor(
    private readonly response: unknown,
    private readonly calls: QueryCall[],
  ) {}

  /** @inheritdoc */
  select(columns: string): AgentDatabaseQuery {
    this.calls.push({ method: "select", args: [columns] });
    return this;
  }

  /** @inheritdoc */
  eq(column: string, value: unknown): AgentDatabaseQuery {
    this.calls.push({ method: "eq", args: [column, value] });
    return this;
  }

  /** @inheritdoc */
  gt(column: string, value: number): AgentDatabaseQuery {
    this.calls.push({ method: "gt", args: [column, value] });
    return this;
  }

  /** @inheritdoc */
  order(column: string, options: { ascending: boolean }): AgentDatabaseQuery {
    this.calls.push({ method: "order", args: [column, options] });
    return this;
  }

  /** @inheritdoc */
  limit(count: number): AgentDatabaseQuery {
    this.calls.push({ method: "limit", args: [count] });
    return this;
  }

  /** @inheritdoc */
  single(): AgentDatabaseQuery {
    this.calls.push({ method: "single", args: [] });
    return this;
  }

  /**
   * 让 fake 查询保持与 PostgREST builder 相同的 thenable 行为。
   *
   * @param onfulfilled - 查询信封成功处理器。
   * @param onrejected - fake promise 拒绝处理器。
   * @returns 处理固定信封的 PromiseLike。
   */
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(
      onfulfilled ?? undefined,
      onrejected ?? undefined,
    );
  }
}

/** 为每个 RPC 和表查询提供队列化响应的窄 Supabase fake。 */
class FakeAgentDatabaseClient implements AgentDatabaseClient {
  /** Repository 发出的全部 RPC 调用。 */
  readonly rpcCalls: RpcCall[] = [];

  /** Repository 构造的全部查询链调用。 */
  readonly queryCalls: QueryCall[] = [];

  /** 每个 RPC 按调用顺序消费的响应信封。 */
  private readonly rpcResponses = new Map<string, unknown[]>();

  /** 每张表按 from 调用顺序消费的响应信封。 */
  private readonly tableResponses = new Map<string, unknown[]>();

  /**
   * 排入一次成功 RPC 响应。
   *
   * @param functionName - PostgreSQL function 名称。
   * @param data - RPC data。
   */
  enqueueRpcData(functionName: string, data: unknown): void {
    this.enqueue(this.rpcResponses, functionName, { data, error: null });
  }

  /**
   * 排入一次带稳定 code 的数据库错误响应。
   *
   * @param functionName - PostgreSQL function 名称。
   * @param error - Supabase 风格错误对象。
   */
  enqueueRpcError(
    functionName: string,
    error: { code: string; message?: string },
  ): void {
    this.enqueue(this.rpcResponses, functionName, { data: null, error });
  }

  /**
   * 排入一次表查询响应。
   *
   * @param table - 查询的 Agent 表。
   * @param data - 查询 data。
   */
  enqueueTableData(
    table: "interview_sessions" | "agent_events",
    data: unknown,
  ): void {
    this.enqueue(this.tableResponses, table, { data, error: null });
  }

  /** @inheritdoc */
  async rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    this.rpcCalls.push({ functionName, args });
    return this.dequeue(this.rpcResponses, functionName);
  }

  /** @inheritdoc */
  from(table: "interview_sessions" | "agent_events"): AgentDatabaseQuery {
    this.queryCalls.push({ method: "from", args: [table] });
    return new FakeAgentDatabaseQuery(
      this.dequeue(this.tableResponses, table),
      this.queryCalls,
    );
  }

  /**
   * 向指定响应队列追加一个值。
   *
   * @param queues - RPC 或表响应映射。
   * @param key - function 或表名。
   * @param response - Supabase 风格响应信封。
   */
  private enqueue(
    queues: Map<string, unknown[]>,
    key: string,
    response: unknown,
  ): void {
    const queue = queues.get(key) ?? [];
    queue.push(response);
    queues.set(key, queue);
  }

  /**
   * 消费指定队列的下一个值；缺少 fixture 表示测试本身配置错误。
   *
   * @param queues - RPC 或表响应映射。
   * @param key - function 或表名。
   * @returns 下一个响应信封。
   */
  private dequeue(queues: Map<string, unknown[]>, key: string): unknown {
    const response = queues.get(key)?.shift();
    if (response === undefined) {
      throw new Error(`Missing fake response for ${key}`);
    }
    return response;
  }
}

/**
 * 构造每个测试共享的最小合法创建参数。
 *
 * @returns 不显式给 webResearch，以验证 Zod 默认值进入 RPC。
 */
function createSessionInput(): CreateAgentSessionRepositoryInput {
  return {
    mode: "single",
    interviewMode: "text",
    position: "Backend Engineer",
    difficulty: "中级",
    questionCount: 5,
    modelProvider: "deepseek",
    modelName: "deepseek-chat",
    promptVersion: "interview-agent-v1",
    webResearch: true,
  };
}

/** 验证创建会话只调用 allowlist RPC，并严格解析创建结果。 */
test("createSession calls the transactional RPC with a credential-free payload", async () => {
  const database = new FakeAgentDatabaseClient();
  database.enqueueRpcData("create_agent_interview_session", {
    sessionId: SESSION_ID,
    threadId: SESSION_ID,
    phase: "preparing",
    eventCursor: 1,
  });
  const repository = new SupabaseInterviewAgentRepository(database);

  const created = await repository.createSession(createSessionInput());

  assert.deepEqual(created, {
    sessionId: SESSION_ID,
    threadId: SESSION_ID,
    phase: "preparing",
    eventCursor: 1,
  });
  assert.deepEqual(database.rpcCalls, [
    {
      functionName: "create_agent_interview_session",
      args: {
        p_session: {
          mode: "single",
          interviewMode: "text",
          position: "Backend Engineer",
          difficulty: "中级",
          questionCount: 5,
          webResearch: true,
          promptVersion: "interview-agent-v1",
          modelProvider: "deepseek",
          modelName: "deepseek-chat",
        },
      },
    },
  ]);
});

/** 验证 completed claim 返回第一次提交结果而不会被误判为新执行权。 */
test("claimOperation returns a safe completed duplicate", async () => {
  const database = new FakeAgentDatabaseClient();
  database.enqueueRpcData("claim_agent_operation", {
    claimed: false,
    duplicate: true,
    inProgress: false,
    status: "completed",
    operationKey: "input:answer-1",
    nodeName: "accept_answer",
    result: { accepted: true, messageId: "message-1" },
    firstEventSequence: 8,
    lastEventSequence: 10,
  });
  const repository = new SupabaseInterviewAgentRepository(database);

  const claim = await repository.claimOperation({
    sessionId: SESSION_ID,
    operationKey: "input:answer-1",
    nodeName: "accept_answer",
  });

  assert.equal(claim.claimed, false);
  assert.equal(claim.duplicate, true);
  assert.deepEqual(claim.result, { accepted: true, messageId: "message-1" });
  assert.deepEqual(database.rpcCalls[0], {
    functionName: "claim_agent_operation",
    args: {
      p_session_id: SESSION_ID,
      p_operation_key: "input:answer-1",
      p_node_name: "accept_answer",
    },
  });
});

/** 验证 commit 只传 type/data，并返回数据库分配的连续事件范围。 */
test("commitOperation serializes safe events and parses the committed range", async () => {
  const database = new FakeAgentDatabaseClient();
  database.enqueueRpcData("commit_agent_operation", {
    committed: true,
    duplicate: false,
    inProgress: false,
    status: "completed",
    operationKey: "node:ask:1",
    nodeName: "ask",
    result: { next: "wait_for_input" },
    firstEventSequence: 2,
    lastEventSequence: 2,
  });
  const repository = new SupabaseInterviewAgentRepository(database);
  const input = {
    sessionId: SESSION_ID,
    operationKey: "node:ask:1",
    nodeName: "ask",
    phase: "awaiting_answer",
    currentRole: "general",
    result: { next: "wait_for_input" },
    events: [
      {
        type: "agent.phase",
        data: { phase: "awaiting_answer" },
      },
    ],
  } satisfies CommitAgentOperationInput;

  const committed = await repository.commitOperation(input);

  assert.equal(committed.committed, true);
  assert.equal(committed.firstEventSequence, 2);
  assert.equal(committed.lastEventSequence, 2);
  assert.deepEqual(database.rpcCalls[0], {
    functionName: "commit_agent_operation",
    args: {
      p_session_id: SESSION_ID,
      p_operation_key: "node:ask:1",
      p_node_name: "ask",
      p_agent_phase: "awaiting_answer",
      p_current_role: "general",
      p_result: { next: "wait_for_input" },
      p_events: [
        {
          type: "agent.phase",
          data: { phase: "awaiting_answer" },
        },
      ],
    },
  });
});

/** 验证 fail 只发送稳定错误码，不存在原始异常消息参数。 */
test("failOperation persists only the sanitized error code", async () => {
  const database = new FakeAgentDatabaseClient();
  database.enqueueRpcData("fail_agent_operation", {
    failed: true,
    duplicate: false,
    status: "failed",
    operationKey: "node:score:1",
    errorCode: "model.timeout",
  });
  const repository = new SupabaseInterviewAgentRepository(database);

  const failed = await repository.failOperation({
    sessionId: SESSION_ID,
    operationKey: "node:score:1",
    errorCode: "MODEL.TIMEOUT",
  });

  assert.deepEqual(failed, {
    failed: true,
    duplicate: false,
    status: "failed",
    operationKey: "node:score:1",
    errorCode: "model.timeout",
  });
  assert.deepEqual(database.rpcCalls[0], {
    functionName: "fail_agent_operation",
    args: {
      p_session_id: SESSION_ID,
      p_operation_key: "node:score:1",
      p_error_code: "model.timeout",
    },
  });
});

/** 验证会话查询只取恢复字段，并递归检查冻结配置。 */
test("getOwnedSessionProjection returns the safe restore projection", async () => {
  const database = new FakeAgentDatabaseClient();
  database.enqueueTableData("interview_sessions", {
    id: SESSION_ID,
    user_id: USER_ID,
    thread_id: SESSION_ID,
    agent_version: "agent-v1",
    agent_mode: "panel",
    interview_mode: "voice",
    agent_phase: "preparing",
    current_role: "technical",
    agent_config: {
      position: "Backend Engineer",
      modelProvider: "deepseek",
      webResearch: true,
    },
    research_status: "pending",
    last_event_seq: 1,
  });
  const repository = new SupabaseInterviewAgentRepository(database);

  const projection = await repository.getOwnedSessionProjection(SESSION_ID);

  assert.equal(projection.userId, USER_ID);
  assert.equal(projection.mode, "panel");
  assert.deepEqual(projection.agentConfig, {
    position: "Backend Engineer",
    modelProvider: "deepseek",
    webResearch: true,
  });
  const selectedColumns = String(database.queryCalls[1]?.args[0]);
  assert.equal(selectedColumns.includes("user_api_key"), false);
  assert.equal(selectedColumns.includes("resume_text"), false);
});

/** 验证数据库顺序不可信时 Repository 仍按 sequence 升序返回一页事件。 */
test("listEventsAfter applies cursor pagination and returns sequence order", async () => {
  const database = new FakeAgentDatabaseClient();
  database.enqueueTableData("agent_events", [
    {
      sequence: 3,
      type: "agent.phase",
      payload: { phase: "awaiting_answer" },
      created_at: CREATED_AT,
    },
    {
      sequence: 2,
      type: "agent.phase",
      payload: { phase: "reasoning" },
      created_at: CREATED_AT,
    },
  ]);
  const repository = new SupabaseInterviewAgentRepository(database);

  const events = await repository.listEventsAfter(SESSION_ID, 1, 10);

  assert.deepEqual(
    events.map((event) => event.sequence),
    [2, 3],
  );
  assert.deepEqual(database.queryCalls, [
    { method: "from", args: ["agent_events"] },
    { method: "select", args: ["sequence, type, payload, created_at"] },
    { method: "eq", args: ["session_id", SESSION_ID] },
    { method: "gt", args: ["sequence", 1] },
    { method: "order", args: ["sequence", { ascending: true }] },
    { method: "limit", args: [10] },
  ]);
});

/** 验证最新快照会删除迁移内部扩展字段，只返回公开 AgentSnapshot。 */
test("getLatestSnapshotEvent projects the latest committed snapshot", async () => {
  const database = new FakeAgentDatabaseClient();
  database.enqueueTableData("agent_events", {
    sequence: 7,
    type: "agent.snapshot",
    payload: {
      sessionId: SESSION_ID,
      threadId: SESSION_ID,
      version: "agent-v1",
      mode: "single",
      interviewMode: "text",
      phase: "awaiting_answer",
      currentRole: "general",
      currentQuestionId: null,
      currentQuestionIndex: 0,
      followUpCount: 0,
      pendingAction: "ask",
      eventCursor: 7,
      config: { position: "Backend Engineer" },
      researchStatus: "completed",
    },
    created_at: CREATED_AT,
  });
  const repository = new SupabaseInterviewAgentRepository(database);

  const event = await repository.getLatestSnapshotEvent(SESSION_ID);

  assert.equal(event.type, "agent.snapshot");
  assert.equal("config" in event.data, false);
  assert.deepEqual(database.queryCalls.at(-3), {
    method: "order",
    args: ["sequence", { ascending: false }],
  });
});

/** 验证畸形 RPC 输出和嵌套敏感字段都会变成固定模块错误。 */
test("malformed or sensitive database output is rejected without details", async () => {
  const malformedDatabase = new FakeAgentDatabaseClient();
  malformedDatabase.enqueueRpcData("create_agent_interview_session", {
    sessionId: SESSION_ID,
    phase: "preparing",
    eventCursor: 1,
  });
  const malformedRepository = new SupabaseInterviewAgentRepository(
    malformedDatabase,
  );

  await assert.rejects(
    malformedRepository.createSession(createSessionInput()),
    (error: unknown) => {
      assert.ok(error instanceof InterviewAgentRepositoryError);
      assert.equal(error.code, "agent_repository_invalid_output");
      return true;
    },
  );

  const sensitiveDatabase = new FakeAgentDatabaseClient();
  sensitiveDatabase.enqueueRpcData("claim_agent_operation", {
    claimed: false,
    duplicate: true,
    inProgress: false,
    status: "completed",
    operationKey: "input:answer-1",
    nodeName: "accept_answer",
    result: { nested: { authorization: "must-not-leave-repository" } },
    firstEventSequence: 8,
    lastEventSequence: 10,
  });
  const sensitiveRepository = new SupabaseInterviewAgentRepository(
    sensitiveDatabase,
  );

  await assert.rejects(
    sensitiveRepository.claimOperation({
      sessionId: SESSION_ID,
      operationKey: "input:answer-1",
      nodeName: "accept_answer",
    }),
    (error: unknown) => {
      assert.ok(error instanceof InterviewAgentRepositoryError);
      assert.equal(error.code, "agent_repository_invalid_output");
      assert.equal(error.message.includes("must-not-leave-repository"), false);
      return true;
    },
  );
});

/** 验证数据库内部 message 不会被 Repository 错误透传。 */
test("database errors map by stable code without leaking raw details", async () => {
  const database = new FakeAgentDatabaseClient();
  database.enqueueRpcError("claim_agent_operation", {
    code: "XX999",
    message: "private SQL and credential details",
  });
  const repository = new SupabaseInterviewAgentRepository(database);

  await assert.rejects(
    repository.claimOperation({
      sessionId: SESSION_ID,
      operationKey: "input:answer-1",
      nodeName: "accept_answer",
    }),
    (error: unknown) => {
      assert.ok(error instanceof InterviewAgentRepositoryError);
      assert.equal(error.code, "agent_repository_unavailable");
      assert.equal(error.message.includes("private SQL"), false);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

/** 验证敏感输入在 RPC 前被拒绝，防止结果或事件跨越持久化边界。 */
test("commitOperation rejects sensitive result JSON before calling RPC", async () => {
  const database = new FakeAgentDatabaseClient();
  const repository = new SupabaseInterviewAgentRepository(database);

  await assert.rejects(
    repository.commitOperation({
      sessionId: SESSION_ID,
      operationKey: "node:ask:2",
      nodeName: "ask",
      phase: "awaiting_answer",
      currentRole: "general",
      result: { nested: { api_key: "must-not-persist" } },
      events: [
        {
          type: "agent.phase",
          data: { phase: "awaiting_answer" },
        },
      ],
    }),
    (error: unknown) => {
      assert.ok(error instanceof InterviewAgentRepositoryError);
      assert.equal(error.code, "agent_repository_invalid_input");
      return true;
    },
  );
  assert.equal(database.rpcCalls.length, 0);
});
