# ezmock Agent 3 项目交接文档

> 更新日期：2026-07-15
> 当前唯一运行时：`agent-v3`
> 冻结计划：`plan-v3`
> 评分量表：`rubric-v3`

## 1. 当前结论

项目已删除 Agent v1/v2 的运行时选择、Graph 分支、环境版本开关和恢复入口。新会话只能创建为 `agent-v3`；已完成的旧会话和报告仍由历史页面只读展示，未完成旧会话会由增量 migration 标记为 `failed/legacy_agent_retired`，交互接口返回 HTTP 410。

Agent 3 的面试链路是：冻结角色/能力蓝图 → Planner 形成结构化选题标准 → 执行受控只读工具 → 按角色、难度、主维度、主题和证据目标选首题 → 基于本题完整消息序列追问 → 按适用维度评分 → 反思下一题策略 → 聚合有效评分生成报告。

## 2. 真实面试逻辑

- Planner 必须在首题选择前运行，输出 `primaryDimension`、`topicKeys`、`evidenceGoalKeys` 和 `questionIntent`。
- 首题及后续模型兜底题会临时获得岗位描述、有限简历摘要、清洗后的研究引用与授权工具结果；正文不进入 Graph State 或 checkpoint。
- 题库题只有同时匹配难度、角色和主维度，并满足 Planner 的主题/证据条件时才能入选；否则由模型生成。
- 每次回答决策读取当前题目的完整有序消息序列，返回稳定原因码、已覆盖证据目标和缺失目标。代码强制最多追问三次。
- 每题主维度由 `plan-v3` 冻结。Reflection 可以改变下一题意图、主题和证据目标，但不能改写冻结量表。
- 主维度无证据时为 0 分；辅助维度无证据时为 `not_observed/score:null`，不参与本题及报告总分。
- 有效评分必须引用候选人消息中的原文；报告只聚合 `scored` 维度，并统计每维证据覆盖次数。

## 3. 双模式边界

创建文本或语音会话时必须显式选择：

- `simulation`：进行中只显示题号、角色、状态和对话；服务端 workspace、SSE 与语音桥均隐藏活动、研究、策略、证据和逐题评分。完成后开放完整报告。
- `coaching`：保留实时活动、证据和逐题反馈。

前端不再根据题号猜测“内容阶段”或“追问类型”。

## 4. 关键代码

- Graph：`api-server/src/modules/interview-agent/graph/interview-agent.graph.ts`
- 会话编排：`api-server/src/modules/interview-agent/interview-agent.service.ts`
- Planner/工具：`api-server/src/modules/agent-orchestration/`
- 准备与选题：`api-server/src/modules/interview-agent/tools/`
- 后续题运行时：`api-server/src/modules/interview-agent/runtime/`
- 评分与报告：`api-server/src/modules/interview-agent/evaluation/`、`report/`
- 服务端脱敏：`api-server/src/modules/interview-agent/workspace/`、`events/`、`voice-bridge/`
- 增量 migration：`supabase/migrations/20260715000001_add_single_agent_v3.sql`
- 策略持久化热修：`supabase/migrations/20260715000002_fix_agent_v3_strategy_json_operator.sql`
- 旧 checkpoint 清理脚本：`api-server/scripts/cleanup-legacy-agent-checkpoints.ts`

## 5. 数据与运维

不得修改更早的历史 migration。部署时依次应用 `20260715000001_add_single_agent_v3.sql` 与 `20260715000002_fix_agent_v3_strategy_json_operator.sql`，再验证 readiness 返回 `20260715000002`。旧 checkpoint 清理脚本默认 dry-run；只有明确授权后才可使用 `--execute`。checkpoint 删除和业务数据删除仍需单独授权。

## 6. 本地验证

```bash
npm test
npm run build
cd api-server
npm test
npm run build
git diff --check
```

若要执行 PostgreSQL checkpoint 集成测试，必须显式配置隔离的 `AGENT_TEST_DATABASE_URL`；测试不会自动使用业务 `DATABASE_URL`。
