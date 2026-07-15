/** Interview Agent 冻结报告聚合和完整题数门禁测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import { DefaultAgentReportService, aggregateFrozenScores } from "./report.service.js";
import type { AgentReportContext, FrozenAgentReport } from "./report.types.js";

const CONTEXT: AgentReportContext = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  questionCount: 2,
  rubric: [
    { key: "technical", label: "技术深度", weight: 2 },
    { key: "communication", label: "沟通表达", weight: 1 },
  ],
  questions: [
    { questionId: "22222222-2222-4222-8222-222222222222", orderIndex: 0, roleId: "technical", overallScore: 80, dimensions: { technical: { status: "scored", score: 90, evidenceIds: ["e1"] }, communication: { status: "scored", score: 60, evidenceIds: ["e2"] } } },
    { questionId: "33333333-3333-4333-8333-333333333333", orderIndex: 1, roleId: "manager", overallScore: 70, dimensions: { technical: { status: "scored", score: 80, evidenceIds: ["e3"] }, communication: { status: "scored", score: 70, evidenceIds: ["e4"] } } },
  ],
  researchSourceCount: 3,
};

test("report aggregates only frozen scores with rubric weights", () => {
  const summary = aggregateFrozenScores(CONTEXT);
  assert.equal(summary.dimensions.technical.score, 85);
  assert.equal(summary.dimensions.communication.score, 65);
  assert.equal(summary.overallScore, 78);
  assert.equal(summary.dimensions.technical.evidenceCoverageCount, 2);
  assert.deepEqual(summary.strengths, ["技术深度(85分)"]);
});

test("report refuses incomplete question evaluations", () => {
  assert.throws(() => aggregateFrozenScores({ ...CONTEXT, questionCount: 3 }));
});

test("report excludes not-observed dimensions from totals and weaknesses", () => {
  const summary = aggregateFrozenScores({
    ...CONTEXT,
    questionCount: 1,
    questions: [{
      ...CONTEXT.questions[0],
      dimensions: {
        technical: { status: "scored", score: 90, evidenceIds: ["e1"] },
        communication: { status: "not_observed", score: null, evidenceIds: [] },
      },
    }],
  });
  assert.equal(summary.overallScore, 90);
  assert.equal("communication" in summary.dimensions, false);
  assert.equal(summary.weaknesses.some((item) => item.includes("communication")), false);
});

test("finalizer commits one deterministic report without a model call", async () => {
  let report: FrozenAgentReport | undefined;
  const service = new DefaultAgentReportService({
    async loadContext() { return CONTEXT; },
    async commitReport(input) {
      report = input;
      return { committed: true, duplicate: false, operationKey: "finalize:report", sessionId: input.sessionId, overallScore: input.overallScore, eventSequence: 12 };
    },
  });
  const receipt = await service.finalize(CONTEXT.sessionId);
  assert.equal(receipt.overallScore, 78);
  assert.equal(report?.researchSourceCount, 3);
  assert.match(report?.overallFeedback ?? "", /证据化综合得分/);
});
