# 详细设计说明书

> 状态：当前；最后核验：2026-07-16

## 1. 模块化设计

### 1.1 后端模块模板

```text
api-server/src/modules/<feature>/
  <feature>.routes.ts       HTTP、认证、Zod、错误映射
  <feature>.schemas.ts      输入/输出运行时校验
  <feature>.service.ts      业务流程与不变量
  <feature>.repository.ts   数据库/RPC/字段映射
  <feature>.types.ts        模块公共类型（按需）
```

Route 不执行复杂业务；Service 不拼接随意数据库查询；Repository 不决定产品流程。

### 1.2 前端 feature 模板

```text
src/features/<feature>/
  api.ts
  types.ts
  constants.ts             可选
  hooks/
  components/
```

路由通过 feature 页面组件组合业务。共享传输、运行配置和平台能力只能从 `src/shared` 使用。

## 2. Agent v3 设计

### 2.1 冻结配置

创建时冻结：交互通道、体验模式、岗位、难度、题量、JD、目标公司、Skill、简历、Brain、训练记忆授权、模型、研究开关和 Prompt 版本。配置不得包含 Key、token 或数据库凭据。

### 2.2 Graph 节点

```text
hydrate_context
load_training_memory
plan_session
authorize_tools
execute_tools
research_context
build_interview_plan
select_question
wait_for_input
guard_input
extract_evidence
decide_followup
interviewer_respond
score_question
reflect_and_replan
advance_stage
finalize_report
update_training_memory
```

`wait_for_input` 使用 LangGraph `interrupt()`。恢复值只包含持久输入 ID，不包含回答正文。

### 2.3 角色计划

- single：`general` 负责全部题目。
- panel：`technical`、`manager`、`hr` 每个至少一题。
- 剩余题量按 60%/25%/15% 最大余数法分配。
- 角色计划和全局题号范围连续，创建后不可被模型修改。

### 2.4 Planner 与工具

Planner 输出目标、主维度、主题、证据目标、问题意图和工具请求。输出必须通过 schema；允许一次 repair，仍无效时使用确定性 fallback。

工具限制：

- 只读 allowlist。
- 最大预算和去重。
- 不允许 SQL、Shell、任意 HTTP 或写数据库工具。
- 结果保存受限引用/上下文，不保存模型思维链。

### 2.5 选题

候选题必须匹配：

1. 当前冻结角色。
2. 难度。
3. 主评分维度。
4. Planner 主题和证据目标。
5. 未按 ID、规范化文本或主题重复。

存在合格题库题时不调用模型；没有候选时模型以严格 JSON 生成一道题。

### 2.6 输入和追问

输入先持久化，再恢复 Graph。Guard 处理：空白、超长、复制题目和中英文 Prompt 注入。

追问决策读取当前题的完整有序对话，输出：`action`、稳定原因码、追问文本、已覆盖目标和缺失目标。代码强制最多三次追问。

### 2.7 评分

评分分为证据提取、模型候选评分、代码校验与聚合：

- Evidence 只能引用候选人消息。
- 维度必须来自冻结能力蓝图。
- 主维度无证据为 0。
- 辅助维度无证据为 `not_observed/score:null`。
- Overall 由代码按冻结权重重算。
- 模型输出非法时最多 repair 一次，第二次失败不静默伪造分数。

### 2.8 报告与记忆

报告只读取已提交的有效评分，聚合维度均分、样本数、优势、弱项和总评。长期记忆仅在用户授权时合并维度分、样本数、重复弱项和建议重点。

## 3. 事件与恢复设计

事件类型包括 snapshot、phase、role_changed、question_ready、message_completed、score_completed、session_completed、activity 和 error。

- Sequence 在会话内严格递增。
- 首次连接发送最新已提交 snapshot。
- 重连按 `Last-Event-ID` 分页重放。
- 游标早于保留窗口、领先或无法追到最新水位时重新同步 snapshot。
- simulation 未完成时过滤 activity 和 score 事件。

## 4. 生命周期设计

| 动作    | 业务效果                     | Checkpoint |
| ------- | ---------------------------- | ---------- |
| pause   | 停止接受回答，可恢复         | 保留       |
| resume  | 恢复进行中                   | 保留       |
| finish  | 聚合已有评分，生成阶段性报告 | 尽力删除   |
| abandon | 进入放弃终态                 | 尽力删除   |
| delete  | 删除整个业务会话             | 尽力删除   |

业务终态先提交；checkpoint 清理失败只记脱敏告警，不回滚用户可见终态。

## 5. 语音设计

### 5.1 连接

文字会话不能升级为语音。语音会话通过受认证 REST 获取两分钟、单次消费的签名 token，再升级 `/api/voice/ws`。

### 5.2 协议

客户端控制事件：`audio_start`、`audio_end`、`interrupt`。二进制帧为 PCM。

服务端事件包括 ready、session_ready、字幕、播报开始/分片/结束、interrupted、question_scored、next_question、session_completed 和稳定 error。

### 5.3 幂等和打断

- `turnId` 规范化为 `voice:<turnId>` inputId。
- 重复 turn 不读取或播报新增事件。
- 打断同时取消当前 ASR、TTS 和 Agent 输出语义。
- 断开连接后清理 Provider 会话和 AbortController。

## 6. 知识库设计

### 6.1 文档处理

创建 processing 记录 -> 解析 -> 分块 -> 批量 Embedding -> 写 chunks -> ready -> 构建图边 -> 关联默认 Brain。图边或默认关联失败不回滚已完成文档；主流程失败将文档标为 failed。

### 6.2 RAG QA

- 多轮会话可根据历史改写查询。
- 向量召回后按相似度和字符预算压缩上下文。
- 文档正文放在不可执行边界内。
- 回答以 SSE 输出，并保存引用 chunk。

### 6.3 图谱

图谱节点为 document/chunk，边表示 chunk 语义相似度。反链详情返回目标 chunk 摘要、相似度和文档标题。

## 7. 模型 Provider 设计

Provider 解析优先级：请求覆盖 -> 用户设置 -> 服务端默认。历史 DeepSeek 别名会规范为当前模型。用户 Key 解密后只保留在服务端内存，不写入冻结配置、事件或日志。

AI 调用按 interactive/generation/report 配置超时和 token 上限。关键输出使用严格 JSON/schema，模型原始错误映射为稳定业务错误。

## 8. 前端状态设计

- React Query 管理服务端资源。
- 创建草稿和回答草稿保存在本地，成功提交后再清理。
- SSE 事件驱动工作台更新；workspace 用于首次/恢复加载。
- 页面状态不得覆盖服务端 snapshot。
- 语音 UI 状态由 speaking/listening/processing/recovery 状态机派生。

## 9. 错误设计

后端错误返回：

```json
{
  "error": "面向用户的脱敏文案",
  "code": "stable_error_code",
  "retryable": true
}
```

前端将网络错误、HTTP 错误和 AbortError 分开处理。未知异常不显示原始响应正文、模型报文或数据库错误。
