import assert from "node:assert/strict";
import test from "node:test";
import { IncrementalQuestionParser } from "./question-generation.service.js";

test("incremental question parser handles arbitrary chunk boundaries", () => {
  const parser = new IncrementalQuestionParser();
  const chunks = [
    '```json\n[{"ques',
    'tion":"Redis 的 \\"热点 Key\\" 怎么处理？","category":"REDIS"},',
    '{"question":"解释事件循环","category":"JS"}]',
  ];
  const output = chunks.flatMap((chunk) => parser.push(chunk));
  assert.deepEqual(output, [
    { question: 'Redis 的 "热点 Key" 怎么处理？', category: "REDIS" },
    { question: "解释事件循环", category: "JS" },
  ]);
});

test("incremental question parser ignores malformed objects and continues", () => {
  const parser = new IncrementalQuestionParser();
  const output = parser.push('[{"question":},{"question":"有效题目"}]');
  assert.deepEqual(output, [{ question: "有效题目", category: null }]);
});
