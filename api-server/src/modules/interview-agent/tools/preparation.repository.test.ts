/** Interview preparation Repository 的列白名单、投影和原子 RPC 序列化测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  InterviewPreparationRepository,
  type PreparationDatabaseClient,
  type PreparationDatabaseQuery,
} from "./preparation.repository.js";
import type { PreparedInterviewPlan } from "./preparation.types.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const QUESTION_ID = "33333333-3333-4333-8333-333333333333";
const RESUME_ID = "44444444-4444-4444-8444-444444444444";

/** 记录查询链并根据表名/岗位返回固定数据。 */
class FakeQuery implements PreparationDatabaseQuery {
  /** 查询选择的列。 */
  selected = "";
  /** 等值过滤。 */
  readonly filters = new Map<string, unknown>();

  /** @param table - 当前查询表。 @param database - fake 数据库。 */
  constructor(
    private readonly table: string,
    private readonly database: FakeDatabase,
  ) {}

  /** @inheritdoc */
  select(columns: string) { this.selected = columns; return this; }
  /** @inheritdoc */
  eq(column: string, value: unknown) { this.filters.set(column, value); return this; }
  /** @inheritdoc */
  order() { return this; }
  /** @inheritdoc */
  limit() { return this; }
  /** @inheritdoc */
  maybeSingle() { return this; }
  /** @inheritdoc */
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.database.queries.push(this);
    return Promise.resolve(this.database.resultFor(this)).then(onfulfilled ?? undefined);
  }

  /** 当前表名，供 fake 数据路由。 */
  get tableName() { return this.table; }
}

/** Supabase 响应信封风格的内存数据库。 */
class FakeDatabase implements PreparationDatabaseClient {
  /** 已执行查询。 */
  readonly queries: FakeQuery[] = [];
  /** 最后一次 RPC。 */
  rpcCall: { name: string; args: Record<string, unknown> } | null = null;

  /** @inheritdoc */
  from(table: "resumes" | "question_bank" | "agent_research_sources" | "interview_messages") {
    return new FakeQuery(table, this);
  }

  /** @inheritdoc */
  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCall = { name, args };
    return {
      data: {
        committed: true,
        duplicate: false,
        inProgress: false,
        status: "completed",
        operationKey: "prepare:agent-v1",
        nodeName: "prepare_interview",
        result: { phase: "awaiting_answer" },
        firstEventSequence: 2,
        lastEventSequence: 4,
      },
      error: null,
    };
  }

  /** 根据明确表和过滤返回测试数据。 */
  resultFor(query: FakeQuery) {
    if (query.tableName === "resumes") {
      return { data: {
        id: RESUME_ID,
        analysis: {
          skills: ["TypeScript", "TypeScript"],
          workExperience: [{ role: "后端工程师" }],
          projects: [{ name: "Agent 平台", techStack: ["Node.js"] }],
          overallAssessment: "具备工程经验",
        },
      }, error: null };
    }
    if (query.tableName === "question_bank") {
      const position = query.filters.get("position") as string;
      return { data: [{
        id: position === "通用" ? "55555555-5555-4555-8555-555555555555" : QUESTION_ID,
        position,
        difficulty: "中级",
        type: "技术题",
        question: `${position}问题`,
        tags: ["technical_depth"],
      }], error: null };
    }
    if (query.tableName === "agent_research_sources") {
      return { data: [{
        category: "role",
        query: "后端工程师能力要求",
        title: "岗位要求",
        url: "https://example.com/role",
        snippet: "需要系统设计能力",
        fetched_at: "2026-07-12T00:00:00.000Z",
        content_hash: "a".repeat(64),
      }], error: null };
    }
    return { data: [{ id: "66666666-6666-4666-8666-666666666666" }], error: null };
  }
}

/** 构造足以验证 RPC 序列化的冻结计划。 */
function planFixture(): PreparedInterviewPlan {
  return {
    version: "plan-v1",
    rolePlan: [{ stageIndex: 0, roleId: "general", questionCount: 3, startQuestionIndex: 0, endQuestionIndex: 2 }],
    capabilityBlueprint: {
      version: "capability-v1",
      questionCount: 3,
      dimensions: [{ key: "technical_depth", label: "技术深度", source: "universal", weight: 1, targetQuestionCount: 3, evidenceHints: [] }],
    },
    questionRoles: ["general", "general", "general"],
    questionDimensions: ["technical_depth", "technical_depth", "technical_depth"],
    firstQuestion: { id: QUESTION_ID, question: "后端工程师问题", position: "后端工程师", difficulty: "中级", type: "技术题", tags: [], source: "bank" },
    researchStatus: "skipped",
    researchSources: [],
  };
}

test("resume projection never selects parsed_text and bounds analysis", async () => {
  const database = new FakeDatabase();
  const repository = new InterviewPreparationRepository(database);
  const summary = await repository.loadResumeSummary(RESUME_ID);
  assert.deepEqual(summary?.skills, ["TypeScript"]);
  assert.deepEqual(summary?.projects, ["Agent 平台 · Node.js"]);
  assert.equal(database.queries[0].selected, "id, analysis");
  assert.equal(database.queries[0].selected.includes("parsed_text"), false);
});

test("question bank uses position first and general fallback", async () => {
  const database = new FakeDatabase();
  const repository = new InterviewPreparationRepository(database);
  const questions = await repository.searchQuestionBank({ position: "后端工程师", difficulty: "中级", limit: 10 });
  assert.equal(questions.length, 2);
  assert.deepEqual(database.queries.map((query) => query.filters.get("position")), ["后端工程师", "通用"]);
  assert.equal(questions.every((question) => question.source === "bank"), true);
});

test("research cache maps snake_case rows and preparation uses one RPC", async () => {
  const database = new FakeDatabase();
  const repository = new InterviewPreparationRepository(database);
  const sources = await repository.loadResearchSources(SESSION_ID);
  assert.equal(sources[0].fetchedAt, "2026-07-12T00:00:00.000Z");
  const result = await repository.commitPreparation({
    sessionId: SESSION_ID,
    operationKey: "prepare:agent-v1",
    nodeName: "prepare_interview",
    currentRole: "general",
    plan: planFixture(),
    question: { id: QUESTION_ID, question: "后端工程师问题", roleId: "general", dimensionKey: "technical_depth", source: "bank", bankQuestionId: QUESTION_ID },
    result: { phase: "awaiting_answer" },
    events: [{ type: "agent.phase", data: { phase: "awaiting_answer" } }],
  });
  assert.equal(result.committed, true);
  assert.equal(database.rpcCall?.name, "commit_agent_preparation");
  assert.deepEqual(database.rpcCall?.args.p_sources, []);
});
