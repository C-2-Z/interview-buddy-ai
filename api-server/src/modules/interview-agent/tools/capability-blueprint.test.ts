/** 能力蓝图题量守恒、角色隔离、Skill 覆盖和确定性测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import type { SkillDef } from "../../skills/skill.types.js";
import { buildRolePlan } from "../roles/personas.js";
import { buildCapabilityBlueprint } from "./capability-blueprint.js";

const TEST_SKILL: SkillDef = {
  id: "backend",
  name: "后端工程师",
  description: "test",
  persona: "test",
  categories: [
    { key: "JAVA", label: "Java", priority: "CORE" },
    { key: "MYSQL", label: "MySQL", priority: "NORMAL" },
    { key: "PROJECT", label: "项目经历", priority: "ALWAYS_ONE" },
  ],
};

test("single and panel blueprints conserve every question from 3 through 10", () => {
  for (const mode of ["single", "panel"] as const) {
    for (let questionCount = 3; questionCount <= 10; questionCount += 1) {
      const plan = buildCapabilityBlueprint({
        mode,
        questionCount,
        rolePlan: buildRolePlan(mode, questionCount),
        skill: TEST_SKILL,
      });
      assert.equal(plan.questionRoles.length, questionCount);
      assert.equal(plan.questionDimensions.length, questionCount);
      assert.equal(
        plan.dimensions.reduce(
          (sum, dimension) => sum + dimension.targetQuestionCount,
          0,
        ),
        questionCount,
      );
    }
  }
});

test("panel stages only receive dimensions allowed by their persona", () => {
  const plan = buildCapabilityBlueprint({
    mode: "panel",
    questionCount: 6,
    rolePlan: buildRolePlan("panel", 6),
    skill: TEST_SKILL,
  });
  for (let index = 0; index < plan.questionRoles.length; index += 1) {
    const role = plan.questionRoles[index];
    const dimension = plan.questionDimensions[index];
    if (role === "technical") {
      assert.ok(
        [
          "JAVA",
          "MYSQL",
          "TECHNICAL_DEPTH",
          "LOGICAL_THINKING",
          "PROBLEM_SOLVING",
          "COMMUNICATION",
        ].includes(dimension),
      );
    }
    if (role === "manager") {
      assert.ok(
        [
          "BUSINESS_JUDGMENT",
          "PROBLEM_SOLVING",
          "LOGICAL_THINKING",
          "COMMUNICATION",
        ].includes(dimension),
      );
    }
    if (role === "hr") {
      assert.ok(["MOTIVATION_FIT", "COMMUNICATION"].includes(dimension));
    }
  }
});

test("Skill categories become dimensions while PROJECT remains a resume tool concern", () => {
  const plan = buildCapabilityBlueprint({
    mode: "single",
    questionCount: 5,
    rolePlan: buildRolePlan("single", 5),
    skill: TEST_SKILL,
  });
  assert.ok(plan.dimensions.some((dimension) => dimension.key === "JAVA"));
  assert.ok(plan.dimensions.some((dimension) => dimension.key === "MYSQL"));
  assert.equal(
    plan.dimensions.some((dimension) => dimension.key === "PROJECT"),
    false,
  );
});

test("the same frozen inputs always produce the same blueprint", () => {
  const input = {
    mode: "panel" as const,
    questionCount: 8,
    rolePlan: buildRolePlan("panel", 8),
    skill: TEST_SKILL,
  };
  assert.deepEqual(
    buildCapabilityBlueprint(input),
    buildCapabilityBlueprint(input),
  );
});
