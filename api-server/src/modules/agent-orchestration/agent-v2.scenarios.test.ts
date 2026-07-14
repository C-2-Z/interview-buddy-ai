/** Agent v2 固定质量场景：离线检查岗位针对性、策略意图覆盖与重复题控制。 */
import assert from "node:assert/strict";
import test from "node:test";
import { DeterministicMockAgentModelProvider } from "../interview-agent/providers/agent-model.provider.js";
import { getRolePersona } from "../interview-agent/roles/personas.js";

/** 每个场景固定岗位、难度、能力维度和预期证据意图，供后续真实 Provider 回归复用。 */
const SCENARIOS = [
  ["Java 后端工程师", "中级", "technical_depth", "验证高并发故障定位与量化结果"],
  ["Java 后端工程师", "高级", "system_design", "验证系统权衡和容量依据"],
  ["前端工程师", "初级", "technical_depth", "验证组件实现和调试证据"],
  ["前端工程师", "高级", "system_design", "验证性能治理决策和指标变化"],
  ["数据分析师", "初级", "evidence", "验证数据清洗过程和结论依据"],
  ["数据分析师", "高级", "communication", "验证复杂洞察的业务转化"],
  ["算法工程师", "中级", "technical_depth", "验证特征工程和离线指标"],
  ["算法工程师", "高级", "system_design", "验证模型上线权衡和监控策略"],
  ["产品经理", "初级", "communication", "验证需求澄清和用户反馈"],
  ["产品经理", "高级", "decision_making", "验证优先级取舍和业务结果"],
  ["测试工程师", "初级", "evidence", "验证缺陷复现步骤和覆盖范围"],
  ["测试工程师", "高级", "system_design", "验证质量体系和风险度量"],
  ["运维工程师", "中级", "technical_depth", "验证事故响应行动和恢复时长"],
  ["SRE 工程师", "高级", "decision_making", "验证 SLO 权衡和复盘改进"],
  ["安全工程师", "中级", "evidence", "验证漏洞判断和修复验证"],
  ["安全工程师", "高级", "system_design", "验证纵深防御设计和残余风险"],
  ["移动端工程师", "初级", "technical_depth", "验证端侧问题诊断和兼容处理"],
  ["移动端工程师", "高级", "system_design", "验证包体性能和架构取舍"],
  ["数据库工程师", "中级", "technical_depth", "验证慢查询优化和指标对比"],
  ["数据库工程师", "高级", "decision_making", "验证一致性可用性取舍"],
  ["云平台工程师", "中级", "system_design", "验证弹性方案和成本依据"],
  ["云平台工程师", "高级", "decision_making", "验证多云架构取舍和风险"],
  ["技术经理", "中级", "communication", "验证跨团队协作行动和结果"],
  ["技术经理", "高级", "leadership", "验证团队能力建设和量化变化"],
  ["项目经理", "初级", "communication", "验证进度同步和阻塞处理"],
  ["项目经理", "高级", "decision_making", "验证范围成本质量取舍"],
  ["解决方案架构师", "中级", "system_design", "验证需求映射和方案边界"],
  ["解决方案架构师", "高级", "communication", "验证技术方案的决策推动"],
  ["大模型应用工程师", "中级", "evidence", "验证评测集和幻觉治理效果"],
  ["大模型应用工程师", "高级", "system_design", "验证 Agent 工具治理和可靠性"],
] as const;

test("thirty fixed scenarios remain targeted and non-repeating", async () => {
  assert.equal(SCENARIOS.length, 30);
  const provider = new DeterministicMockAgentModelProvider();
  for (const [position, difficulty, dimensionKey, strategyIntent] of SCENARIOS) {
    const outputs = await Promise.all([0, 1, 2].map((questionIndex) => provider.generateQuestion({
      sessionId: "11111111-1111-4111-8111-111111111111",
      questionIndex,
      roleId: "general",
      persona: getRolePersona("general"),
      position,
      difficulty,
      dimensionKey,
      strategyIntent,
      promptVersion: "agent-v2-scenario",
    })));
    assert.equal(new Set(outputs.map((item) => item.questionId)).size, outputs.length);
    for (const output of outputs) {
      assert.match(output.content, new RegExp(position.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.equal(output.content.includes(strategyIntent), true);
      assert.equal(output.content.includes(dimensionKey), true);
    }
  }
});
