/** Interview Agent 证据引用、加权评分和一次修复重试测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  QuestionEvaluationService,
  buildQuestionEvaluation,
  validateExtractedEvidence,
  type AgentEvaluationRepository,
} from "./evaluation.service.js";
import type { CommitQuestionEvaluationInput, QuestionEvaluationContext } from "./evaluation.types.js";
import type { ModelEvaluationOutput } from "./evaluation.schemas.js";

const CONTEXT: QuestionEvaluationContext = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  questionId: "22222222-2222-4222-8222-222222222222",
  question: "请说明一次性能优化经历。",
  promptVersion: "agent-v3-test",
  modelProvider: "deepseek",
  modelName: "deepseek-v4-flash",
  rubricVersion: "rubric-v3",
  primaryDimensionKey: "technical_depth",
  rubric: [
    { key: "technical_depth", label: "技术深度", weight: 2 },
    { key: "communication", label: "沟通表达", weight: 1 },
  ],
  messages: [{
    id: "33333333-3333-4333-8333-333333333333",
    content: "我分析执行计划后增加联合索引，最终 P95 延迟从 800 毫秒降到 120 毫秒。",
  }],
};

test("evidence keeps only candidate quotes from frozen dimensions", () => {
  const evidence = validateExtractedEvidence(CONTEXT, { evidence: [
    {
      messageId: CONTEXT.messages[0].id,
      dimensionKey: "technical_depth",
      claim: "使用执行计划和联合索引优化",
      quote: "增加联合索引",
      polarity: "positive",
      confidence: 0.9,
    },
    {
      messageId: CONTEXT.messages[0].id,
      dimensionKey: "unknown",
      claim: "越权维度",
      quote: "增加联合索引",
      polarity: "neutral",
      confidence: 0.5,
    },
    {
      messageId: CONTEXT.messages[0].id,
      dimensionKey: "communication",
      claim: "伪造引用",
      quote: "不存在的原文",
      polarity: "positive",
      confidence: 1,
    },
  ] });
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].dimensionKey, "technical_depth");
  assert.match(evidence[0].id, /^[0-9a-f-]{36}$/);
});

test("overall score is recomputed from frozen weights and evidence refs", () => {
  const evidence = validateExtractedEvidence(CONTEXT, { evidence: [{
    messageId: CONTEXT.messages[0].id,
    dimensionKey: "technical_depth",
    claim: "量化优化结果",
    quote: "P95 延迟从 800 毫秒降到 120 毫秒",
    polarity: "positive",
    confidence: 0.95,
  }] });
  const evaluation = buildQuestionEvaluation(CONTEXT, evidence, {
    dimensions: {
      technical_depth: { status: "scored", score: 90, rationale: "有量化技术证据", evidenceIds: [evidence[0].id] },
      communication: { status: "not_observed", score: null, rationale: "证据不足", evidenceIds: [] },
    },
    feedback: "继续补充方案权衡。",
  });
  assert.equal(evaluation.overallScore, 90);
  assert.throws(() => buildQuestionEvaluation(CONTEXT, evidence, {
    dimensions: {
      technical_depth: { status: "scored", score: 90, rationale: "引用未知证据", evidenceIds: ["44444444-4444-4444-8444-444444444444"] },
      communication: { status: "not_observed", score: null, rationale: "证据不足", evidenceIds: [] },
    },
    feedback: "反馈",
  }));
});

test("missing primary evidence scores zero while missing auxiliary evidence is not observed", () => {
  const evaluation = buildQuestionEvaluation(CONTEXT, [], {
    dimensions: {
      technical_depth: {
        status: "not_observed",
        score: null,
        rationale: "没有技术证据",
        evidenceIds: [],
      },
      communication: {
        status: "not_observed",
        score: null,
        rationale: "没有沟通证据",
        evidenceIds: [],
      },
    },
    feedback: "需要补充可验证的候选人原文。",
  });
  assert.deepEqual(evaluation.dimensions.technical_depth, {
    status: "scored",
    score: 0,
    rationale: "主维度在追问上限内仍无可验证候选人原文证据。",
    evidenceIds: [],
  });
  assert.equal(evaluation.dimensions.communication.status, "not_observed");
  assert.equal(evaluation.dimensions.communication.score, null);
  assert.equal(evaluation.overallScore, 0);
});

test("service repairs one invalid evaluation then commits once", async () => {
  let attempts = 0;
  let committed: CommitQuestionEvaluationInput | undefined;
  const repository: AgentEvaluationRepository = {
    async loadContext() { return CONTEXT; },
    async commitEvaluation(input) {
      committed = input;
      return { committed: true, duplicate: false, operationKey: `evaluate:${CONTEXT.questionId}`, questionId: CONTEXT.questionId, overallScore: input.evaluation.overallScore, eventSequence: 9, evidenceIds: input.evidence.map((item) => item.id) };
    },
    async markEvaluationFailed() { throw new Error("valid repair must not fail"); },
  };
  const service = new QuestionEvaluationService(repository, {
    async extractEvidence() {
      return { evidence: [{ messageId: CONTEXT.messages[0].id, dimensionKey: "technical_depth", claim: "量化优化", quote: "P95 延迟从 800 毫秒降到 120 毫秒", polarity: "positive", confidence: 0.9 }] };
    },
    async evaluate(_context, evidence, repair): Promise<ModelEvaluationOutput> {
      attempts += 1;
      if (!repair) return { dimensions: { technical_depth: { status: "scored", score: 90, rationale: "缺少维度", evidenceIds: [evidence[0].id] } }, feedback: "首次非法" };
      return { dimensions: {
        technical_depth: { status: "scored", score: 90, rationale: "有量化证据", evidenceIds: [evidence[0].id] },
        communication: { status: "not_observed", score: null, rationale: "证据不足", evidenceIds: [] },
      }, feedback: "修复完成" };
    },
  });
  const receipt = await service.evaluateAndCommit(CONTEXT.sessionId, CONTEXT.questionId);
  assert.equal(attempts, 2);
  assert.equal(receipt.overallScore, 90);
  assert.equal(committed?.evaluation.feedback, "修复完成");
});

test("second invalid evaluation fails without a silent fallback", async () => {
  let committed = false;
  let failed = false;
  const service = new QuestionEvaluationService({
    async loadContext() { return CONTEXT; },
    async commitEvaluation() { committed = true; throw new Error("must not commit"); },
    async markEvaluationFailed() { failed = true; },
  }, {
    async extractEvidence() { return { evidence: [] }; },
    async evaluate() { return { dimensions: {}, feedback: "invalid" }; },
  });
  await assert.rejects(service.evaluateAndCommit(CONTEXT.sessionId, CONTEXT.questionId));
  assert.equal(committed, false);
  assert.equal(failed, true);
});
