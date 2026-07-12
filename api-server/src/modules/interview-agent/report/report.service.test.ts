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
    { questionId: "22222222-2222-4222-8222-222222222222", orderIndex: 0, roleId: "technical", overallScore: 80, dimensions: { technical: { score: 90 }, communication: { score: 60 } } },
    { questionId: "33333333-3333-4333-8333-333333333333", orderIndex: 1, roleId: "manager", overallScore: 70, dimensions: { technical: { score: 80 }, communication: { score: 70 } } },
  ],
  researchSourceCount: 3,
};

test("report aggregates only frozen scores with rubric weights", () => {
  const summary = aggregateFrozenScores(CONTEXT);
  assert.equal(summary.dimensions.technical.score, 85);
  assert.equal(summary.dimensions.communication.score, 65);
  assert.equal(summary.overallScore, 78);
  assert.deepEqual(summary.strengths, ["技术深度(85分)"]);
});

test("report refuses incomplete question evaluations", () => {
  assert.throws(() => aggregateFrozenScores({ ...CONTEXT, questionCount: 3 }));
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
