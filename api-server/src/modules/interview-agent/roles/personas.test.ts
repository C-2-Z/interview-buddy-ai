/** 固定 Persona 与 3–10 题角色分配算法的单元测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildRolePlan, PANEL_ROLE_ORDER, ROLE_PERSONAS } from "./personas.js";

const EXPECTED_PANEL_COUNTS: Readonly<Record<number, readonly [number, number, number]>> = {
  3: [1, 1, 1],
  4: [2, 1, 1],
  5: [2, 2, 1],
  6: [3, 2, 1],
  7: [3, 2, 2],
  8: [4, 2, 2],
  9: [5, 2, 2],
  10: [5, 3, 2],
};

test("panel role plan covers every question count from 3 through 10", () => {
  for (let questionCount = 3; questionCount <= 10; questionCount += 1) {
    const plan = buildRolePlan("panel", questionCount);
    assert.deepEqual(
      plan.map((stage) => stage.roleId),
      PANEL_ROLE_ORDER,
      `${questionCount} questions must preserve the technical-manager-hr handoff`,
    );
    assert.deepEqual(
      plan.map((stage) => stage.questionCount),
      EXPECTED_PANEL_COUNTS[questionCount],
      `${questionCount} questions must use the deterministic largest-remainder allocation`,
    );
    assert.equal(
      plan.reduce((sum, stage) => sum + stage.questionCount, 0),
      questionCount,
      `${questionCount} questions must all be assigned`,
    );
    assert.ok(
      plan.every((stage) => stage.questionCount >= 1),
      `${questionCount} questions must give every panel role at least one question`,
    );
  }
});

test("panel role plan exposes continuous global question ranges", () => {
  for (let questionCount = 3; questionCount <= 10; questionCount += 1) {
    const plan = buildRolePlan("panel", questionCount);
    assert.equal(plan[0].startQuestionIndex, 0);
    assert.equal(plan.at(-1)?.endQuestionIndex, questionCount - 1);
    for (let stageIndex = 1; stageIndex < plan.length; stageIndex += 1) {
      assert.equal(
        plan[stageIndex].startQuestionIndex,
        plan[stageIndex - 1].endQuestionIndex + 1,
      );
    }
  }
});

test("single mode assigns all supported question counts to general", () => {
  for (let questionCount = 3; questionCount <= 10; questionCount += 1) {
    assert.deepEqual(buildRolePlan("single", questionCount), [
      {
        stageIndex: 0,
        roleId: "general",
        questionCount,
        startQuestionIndex: 0,
        endQuestionIndex: questionCount - 1,
      },
    ]);
  }
});

test("role plan rejects non-integer and out-of-range question counts", () => {
  for (const invalidCount of [2, 3.5, 11]) {
    assert.throws(() => buildRolePlan("panel", invalidCount), RangeError);
  }
});

test("persona registry defines every supported role with matching ids", () => {
  assert.deepEqual(Object.keys(ROLE_PERSONAS), ["general", "technical", "manager", "hr"]);
  for (const [roleId, persona] of Object.entries(ROLE_PERSONAS)) {
    assert.equal(persona.id, roleId);
    assert.ok(persona.goals.length > 0);
    assert.ok(persona.allowedTopics.length > 0);
    assert.ok(persona.prohibitedBehaviors.length > 0);
  }
});
