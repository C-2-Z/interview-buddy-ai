/** Interview Agent 回答充分度与追问模板测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import { assessAnswerSufficiency, buildFocusedFollowUp } from "./answer-sufficiency.js";

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
