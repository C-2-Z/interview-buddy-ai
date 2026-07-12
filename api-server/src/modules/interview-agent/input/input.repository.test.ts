/** Interview Agent 输入 Repository 的 receipt 序列化与按引用读取测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  SupabaseAgentInputRepository,
  type AgentInputDatabaseClient,
  type AgentInputDatabaseQuery,
} from "./input.repository.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const MESSAGE_ID = "22222222-2222-4222-8222-222222222222";
const QUESTION_ID = "33333333-3333-4333-8333-333333333333";

/** 记录输入查询过滤而不实现无关 Supabase 能力。 */
class FakeInputQuery implements AgentInputDatabaseQuery {
  /** 选择列。 */
  selected = "";
  /** 等值过滤。 */
  readonly filters = new Map<string, unknown>();
  /** @param result - Supabase 风格响应。 */
  constructor(private readonly result: unknown) {}
  /** @inheritdoc */
  select(columns: string) { this.selected = columns; return this; }
  /** @inheritdoc */
  eq(column: string, value: unknown) { this.filters.set(column, value); return this; }
  /** @inheritdoc */
  single() { return this; }
  /** @inheritdoc */
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled ?? undefined);
  }
}

test("acceptInput sends content only to the durable receipt RPC", async () => {
  let rpc: { name: string; args: Record<string, unknown> } | undefined;
  const database: AgentInputDatabaseClient = {
    async rpc(name, args) {
      rpc = { name, args };
      return { data: { accepted: true, duplicate: false, operationKey: "receive:answer-1", messageId: MESSAGE_ID, questionId: QUESTION_ID, eventSequence: 5 }, error: null };
    },
    from() { throw new Error("unused"); },
  };
  const repository = new SupabaseAgentInputRepository(database);
  const receipt = await repository.acceptInput({ sessionId: SESSION_ID, inputId: "answer-1", content: "候选人回答", source: "text" });
  assert.equal(receipt.accepted, true);
  assert.equal(rpc?.name, "accept_agent_input");
  assert.deepEqual(rpc?.args, { p_session_id: SESSION_ID, p_input_id: "answer-1", p_content: "候选人回答", p_source: "text" });
});

test("loadInput requires input, user role and expected session filters", async () => {
  const query = new FakeInputQuery({ data: {
    id: MESSAGE_ID,
    input_id: "answer-1",
    question_id: QUESTION_ID,
    content: "候选人回答",
    source: "text",
    created_at: "2026-07-12T00:00:00.000Z",
    interview_questions: { session_id: SESSION_ID, question: "当前题目" },
  }, error: null });
  const database: AgentInputDatabaseClient = {
    async rpc() { throw new Error("unused"); },
    from() { return query; },
  };
  const repository = new SupabaseAgentInputRepository(database);
  const input = await repository.loadInput(SESSION_ID, "answer-1");
  assert.equal(input.content, "候选人回答");
  assert.equal(query.filters.get("input_id"), "answer-1");
  assert.equal(query.filters.get("role"), "user");
  assert.equal(query.filters.get("interview_questions.session_id"), SESSION_ID);
  assert.equal(query.selected.includes("interview_questions!inner"), true);
});

test("commitInterviewerResponse uses the fixed response RPC contract", async () => {
  let rpc: { name: string; args: Record<string, unknown> } | undefined;
  const database: AgentInputDatabaseClient = {
    async rpc(name, args) {
      rpc = { name, args };
      return { data: {
        committed: true,
        duplicate: false,
        operationKey: "respond:answer-1:redirect",
        messageId: MESSAGE_ID,
        questionId: QUESTION_ID,
        responseType: "redirect",
        followUpCount: 0,
        eventSequence: 6,
      }, error: null };
    },
    from() { throw new Error("unused"); },
  };
  const repository = new SupabaseAgentInputRepository(database);
  const receipt = await repository.commitInterviewerResponse({
    sessionId: SESSION_ID,
    inputId: "answer-1",
    responseType: "redirect",
    content: "请结合自己的经历回答。",
  });
  assert.equal(receipt.followUpCount, 0);
  assert.equal(rpc?.name, "commit_agent_interviewer_response");
  assert.deepEqual(rpc?.args, {
    p_session_id: SESSION_ID,
    p_input_id: "answer-1",
    p_response_type: "redirect",
    p_content: "请结合自己的经历回答。",
  });
});
