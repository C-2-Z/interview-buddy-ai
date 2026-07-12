/** 题库优先、确定性排序、去重与模型兜底测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeQuestionTopic,
  selectQuestionFromBank,
  selectQuestionWithFallback,
} from "./question-selector.js";
import type { AgentQuestionCandidate } from "./preparation.types.js";

const CANDIDATES: AgentQuestionCandidate[] = [
  {
    id: "b",
    question: "请解释数据库索引的权衡。",
    position: "后端工程师",
    difficulty: "中级",
    type: "technical",
    tags: ["MYSQL", "technical"],
    source: "bank",
  },
  {
    id: "a",
    question: "请描述一次跨团队协作。",
    position: "后端工程师",
    difficulty: "中级",
    type: "behavioral",
    tags: ["COMMUNICATION", "manager"],
    source: "bank",
  },
];

test("selector prefers dimension and role matching bank question", () => {
  const selected = selectQuestionFromBank(CANDIDATES, {
    position: "后端工程师",
    difficulty: "中级",
    roleId: "technical",
    dimensionKey: "MYSQL",
    excludedQuestionIds: new Set(),
    excludedQuestionTexts: new Set(),
    excludedTopicKeys: new Set(),
  });
  assert.equal(selected?.id, "b");
});

test("selector removes repeated IDs, normalized text and covered topics", () => {
  const selected = selectQuestionFromBank(CANDIDATES, {
    position: "后端工程师",
    difficulty: "中级",
    roleId: "technical",
    dimensionKey: "MYSQL",
    excludedQuestionIds: new Set(["a"]),
    excludedQuestionTexts: new Set([
      normalizeQuestionTopic("请解释数据库索引的权衡"),
    ]),
    excludedTopicKeys: new Set(),
  });
  assert.equal(selected, null);
});

test("equal scores use stable candidate id ordering", () => {
  const equal = CANDIDATES.map((candidate) => ({
    ...candidate,
    question: `${candidate.id} question`,
    tags: [],
    type: "generic",
  }));
  const selected = selectQuestionFromBank(equal, {
    position: "后端工程师",
    difficulty: "中级",
    roleId: "general",
    dimensionKey: "UNKNOWN",
    excludedQuestionIds: new Set(),
    excludedQuestionTexts: new Set(),
    excludedTopicKeys: new Set(),
  });
  assert.equal(selected?.id, "a");
});

test("model fallback runs only when no bank question remains", async () => {
  let fallbackCalls = 0;
  const generated = await selectQuestionWithFallback(
    [],
    {
      position: "后端工程师",
      difficulty: "高级",
      roleId: "technical",
      dimensionKey: "SYSTEM_DESIGN",
      excludedQuestionIds: new Set(),
      excludedQuestionTexts: new Set(),
      excludedTopicKeys: new Set(),
    },
    async () => {
      fallbackCalls += 1;
      return {
        id: "model:1",
        question: "设计一个可恢复的任务系统。",
        position: "后端工程师",
        difficulty: "高级",
        type: "SYSTEM_DESIGN",
        tags: ["SYSTEM_DESIGN"],
        source: "model",
      };
    },
  );
  assert.equal(generated.source, "model");
  assert.equal(fallbackCalls, 1);
});
