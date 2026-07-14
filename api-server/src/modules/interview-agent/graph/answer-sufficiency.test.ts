/** Interview Agent 回答充分度与追问模板测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import { assessAnswerSufficiency, buildFocusedFollowUp, extractKeywords, detectVagueSignal, buildVagueFollowUp } from "./answer-sufficiency.js";

test("short or abstract answers expose a stable first evidence gap", () => {
  assert.deepEqual(assessAnswerSufficiency("我优化了系统。"), { sufficient: false, gap: "too_brief" });
  assert.equal(assessAnswerSufficiency("这个项目的整体情况比较复杂，团队需要综合考虑架构、资源、交付周期、业务价值和长期风险之后才能做出合适判断与取舍。").gap, "missing_action");
});

test("concrete action, result and metric reaches minimum sufficiency", () => {
  const answer = "我先分析慢查询日志和执行计划，定位到联合索引缺失；随后调整索引并进行压测，最终接口 P95 延迟从 800 毫秒降低到 120 毫秒。";
  assert.deepEqual(assessAnswerSufficiency(answer), { sufficient: true, gap: null });
});

test("follow-up template follows role and never supplies a candidate answer", () => {
  const followUp = buildFocusedFollowUp("technical", "missing_result");
  assert.match(followUp, /技术实现/);
  assert.match(followUp, /可验证的结果/);
  assert.equal(followUp.includes("标准答案"), false);
});


test("extractKeywords finds technical terms", () => {
  const answer = "我们使用 BGE-M3 做 embedding，用 FAISS 做向量检索，Redis 缓存结果";
  const keywords = extractKeywords(answer);
  assert.ok(keywords.includes("BGE-M3"));
  assert.ok(keywords.includes("FAISS"));
  assert.ok(keywords.includes("Redis"));
});

test("extractKeywords returns at most 5 keywords", () => {
  const keywords = extractKeywords("A B C D E F G");
  assert.ok(keywords.length <= 5);
});

test("extractKeywords returns empty for short answers", () => {
  assert.deepEqual(extractKeywords("还行"), []);
});

test("detectVagueSignal detects vague descriptions", () => {
  assert.ok(detectVagueSignal("我们对系统做了优化，效果不错"));
});

test("detectVagueSignal does not fire on specific descriptions", () => {
  const answer = "batch size 从 32 调到 128，检索准确率从 89% 提升到 94%";
  assert.equal(detectVagueSignal(answer), false);
});

test("buildVagueFollowUp with keywords generates comparison question", () => {
  const result = buildVagueFollowUp("technical", ["BGE-M3"]);
  assert.ok(result.includes("BGE-M3"));
  // 4 个模板都包含对比含义：选择/对比/是什么/为什么
  assert.ok(result.length > 15);
  // 所有模板都包含技术关键词
  assert.ok(result.includes("BGE-M3"));
});

test("buildVagueFollowUp without keywords asks for concrete example", () => {
  const result = buildVagueFollowUp("general", []);
  assert.ok(result.includes("例子"));
});
