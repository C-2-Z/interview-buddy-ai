# ezmock Agent 2.0 项目交接文档（历史归档）

> **已退役：** 本文只用于追溯 Agent v1/v2 的历史设计，不可作为当前实现依据。当前唯一运行时请阅读 `docs/NEXT_AI_AGENT_V3_HANDOFF_2026-07-15.md`。

> 更新时间：2026-07-15
>
> 面向对象：下一位接手本仓库的 AI。开始工作前必须先阅读根目录 `AGENTS.md`，并以实际代码、数据库探测结果和本文件为准；旧交接文档中的分支、迁移版本和 checkpoint 地址可能已经过时。

## 1. 接手时的确定状态

- 工作目录：`C:\Users\cys\ezmock`
- 当前分支：`main`
- 当前提交：`eab90cd fix(agent): 缩短首题准备与工作台恢复耗时`
- GitLab：`gitlab/main` 已与 `main` 对齐到 `eab90cd`
- Agent v2 当前在本机启用：
  - `AGENT_INTERVIEW_ENABLED=1`
  - `AGENT_V2_ENABLED=1`
  - `AGENT_DEFAULT_VERSION=agent-v2`
  - `AGENT_ALLOW_MEMORY_CHECKPOINTER=0`
  - `AGENT_CHECKPOINT_SCHEMA=langgraph`
- 不要在文档、日志、提交或聊天输出中复制 `.env` 的 URL 密码、API Key、service role key、PAT 或 token。

### 当前脏工作区

下列改动不属于最近的 Agent 首题性能修复，所有权尚未确认。接手后必须保留，不要删除、还原、覆盖或顺手纳入 Agent 提交：

```text
M  api-server/package.json
M  docs/CROSS_PLATFORM_FOUNDATION.md
M  docs/ai-usage-log.md
M  package-lock.json
M  package.json
M  src/app/start.ts
M  src/routes/__root.tsx
M  src/server.ts
?? docs/Sprint2验收准备指南.md
?? docs/acceptance-evidence/
?? src/shared/logger/
?? 项目周报_choice-whu_2026-07-07至2026-07-13.md
```

本交接文档自身也是新文件。除非用户明确要求提交，否则不要把它与上述改动一起提交。

## 2. 当前产品与 Agent 能力

当前主链路已经不是“固定状态机加模型出题”，而是受控 Agent v2：

```text
读取冻结上下文
→ 读取已授权训练记忆
→ 规划本场策略
→ 审批并执行可选工具
→ 选择首题
→ 等待回答
→ 输入安全检查
→ 决定追问或评分
→ 评分后反思并修订策略
→ 下一题或生成报告
→ 按授权更新训练记忆
```

控制权边界：

- 题量、角色阶段、评分权重、追问上限和结束条件由代码冻结。
- 模型只负责战术规划、白名单只读工具选择、追问/评分决策和后续策略建议。
- v1 Graph 保留不动；会话按持久化的 `agent_version` 和独立 checkpoint namespace 恢复。
- 客户端不能指定或覆盖 Agent 版本，新会话版本由服务端发布开关决定。
- checkpoint 只保存控制数据和引用，例如策略修订 ID、观察 ID、工具预算和当前问题意图。
- 回答正文、网页原文、知识库全文、API Key、Prompt 全文和模型原始推理不得进入 checkpoint。
- 前端只展示行动、来源、简短原因和结果，不展示思维链。

### 动态工具

Planner 可从白名单中按需选择：

- `search_question_bank`
- `web_search`
- `search_knowledge`
- `load_session_messages`
- `load_training_profile`

所有工具都必须经过只读注册表、会话所有权、参数边界和预算审批。网页与知识库内容属于不可信数据，不能改变系统规则。工具失败只降低上下文质量，不得中止面试。

### Brain 与长期训练记忆

- Brain 必须由用户在创建会话时主动选择，不能隐式搜索默认或全部 Brain。
- 长期训练记忆默认关闭，读取和写入都要重新检查用户开关。
- 训练记忆只保存聚合维度分、重复弱项、趋势和建议，不保存回答原文。
- 只有完成或提前生成有效报告的会话可以更新长期记忆。

## 3. 关键架构入口

### 后端

```text
api-server/src/modules/interview-agent/
├─ interview-agent.routes.ts       # 会话、输入、SSE、重试、workspace
├─ interview-agent.service.ts      # 创建、恢复与 Graph 编排
├─ interview-agent.repository.ts   # 幂等 RPC、事件、快照与所有权
├─ graph/interview-agent.graph.ts  # v1/v2 Graph 编译与节点
├─ graph/checkpointer.ts           # PostgresSaver 与 namespace
├─ workspace/                      # 一次 RPC 的页面投影
├─ runtime/                        # 选题与题目提交
├─ evaluation/                     # 证据提取和冻结评分
└─ report/                         # 报告汇总

api-server/src/modules/agent-orchestration/
├─ agent-orchestration.routes.ts
├─ agent-orchestration.service.ts
├─ agent-orchestration.repository.ts
├─ agent-orchestration.schemas.ts
├─ agent-orchestration.types.ts
└─ agent-orchestration.provider.ts

api-server/src/modules/agent-memory/
├─ agent-memory.routes.ts
├─ agent-memory.service.ts
├─ agent-memory.repository.ts
├─ agent-memory.schemas.ts
└─ agent-memory.types.ts
```

所有新功能仍须遵守 `AGENTS.md`：后端独立四层模块、前端独立 feature、路由保持薄入口、使用 `consola` 模块 logger、函数和类型写目的性注释。

### 前端

```text
src/features/interview-agent/       # 创建、会话、SSE、文字和语音
src/features/agent-orchestration/   # 策略活动与准备时间线
src/features/agent-memory/          # 训练记忆授权和清除
src/features/agent-readiness/       # 创建前能力检查
src/features/agent-create-recovery/ # 创建失败后的可恢复动作
```

首题实时显示的关键逻辑在：

```text
src/features/interview-agent/hooks/use-agent-session.ts
```

`agent.question_ready` 到达后会直接写入本地 `workspace.questions`，不再为了显示首题同步等待完整 workspace 刷新。不要退回“收到事件后只调用 refresh”的旧实现。

## 4. 双数据库边界

这是接手后最容易误操作的部分。

### Supabase 业务数据库

保存：

- 用户、会话、题目和消息
- Agent 事件、操作和模型审计
- 策略修订、工具活动与知识引用
- Brain、训练记忆、评分和报告

业务迁移位于 `supabase/migrations/`。截至交接时，远端 Supabase 已验证存在 v2 表、最新 workspace RPC，并已精确执行以下 v2 业务增量：

```text
20260714000002_add_controlled_agent_v2.sql
20260714000003_update_agent_activity_progress.sql
20260714000004_allow_agent_activity_events.sql
20260714000005_allow_agent_v2_current_question.sql
20260714000006_add_agent_workspace_projection.sql
```

远端 `check_agent_readiness()` 已返回 `20260714000006`，`agent_strategy_revisions` 和 `get_agent_workspace(uuid)` 已存在。远端 Supabase 中没有 `langgraph.checkpoints`，这符合当前双数据库部署边界。

重要限制：远端 Supabase 的 migration history 尚未建立可信基线。不要直接执行全量 `supabase db push --include-all`，否则可能重复执行旧迁移。需要新增迁移时，先确认远端 schema 和历史，再精确执行单个增量迁移。

### LangGraph checkpoint 数据库

根目录 `.env` 的 `DATABASE_URL` 当前指向独立 PostgreSQL checkpoint 数据库。它不是 Supabase 业务数据库，不包含 `public.interview_sessions`，也不应该创建整套业务表。

`20260714000001_add_agent_checkpoint_schema.sql` 是 checkpoint schema 的声明文件，但当前运行时 checkpoint 位于 `DATABASE_URL` 指向的独立数据库，不要因为该文件位于 `supabase/migrations/` 就把业务库和 checkpoint 库视为同一个数据库。

它只负责：

- `langgraph` schema 下的 checkpoints
- checkpoint blobs、writes 和迁移元数据
- v1/v2 Graph 的中断恢复

因此：

- 业务迁移只能应用到 Supabase 业务库。
- `npm run agent:checkpoint:setup` 只初始化 checkpoint schema。
- readiness 同时检查 Supabase 业务迁移版本和 `DATABASE_URL` 的 checkpoint schema。
- 业务会话终态与 checkpoint 删除跨两个数据库，不具备单库事务；失败时只能脱敏告警并补偿清理。

## 5. 最近完成的关键提交

```text
eab90cd fix(agent): 缩短首题准备与工作台恢复耗时
ed0699e fix(interview-agent): 缩短 Agent v2 首题准备时间
ff98e19 fix(interview-agent): 修复 Agent v2 准备活动写入失败
dec076d feat(interview-agent): 新增 Agent 准备过程实时进度
1e15970 fix(db): 修复 Agent v2 迁移版本冲突
0277f43 feat(interview-agent): 新增受控 Agent 2.0 闭环
d6742b4 db: 新增 LangGraph checkpoint schema 迁移文件
```

`eab90cd` 的核心变化：

1. `agent.question_ready` 直接增量更新前端工作区。
2. 新增 `get_agent_workspace(uuid)`，把原先多次 PostgREST 查询合并成一次所有权校验 RPC。
3. workspace 路由不再串行读取 session、snapshot、strategy 和 activities。
4. readiness 迁移版本提升到 `20260714000006`。

## 6. 已验证的真实结果

2026-07-14 使用一次性 Supabase 已确认用户，对本地 API 和远端业务库执行了完整闭环，结束后已删除临时用户及级联数据：

```text
readiness                 ready
创建接口返回              1537 ms
首题准备完成              11174 ms
workspace 最大读取耗时     628 ms
workspace 常见读取耗时     280–313 ms
回答提交                  22157 ms
回答后 workspace           284 ms
回答持久化                true
回答后阶段                awaiting_answer
当前题号                  1（已进入第二题）
```

优化前 workspace 单次读取常为 8–10 秒。现在首题真实生成仍约 11 秒，但题目事件到达后不会再叠加一次 8–10 秒的页面刷新等待。

最近一次验证结果：

- API 完整测试链路共 151 项通过。
- `cd api-server && npm run build` 通过。
- 根目录 `npm run build` 通过客户端和 SSR 构建。
- `git diff --check` 通过。
- 前端构建仍有入口 chunk 大于 500 kB 的非阻断警告。

## 7. 启动与验证

首次接手不要假定旧进程仍在运行。

```powershell
# 安装依赖
npm install
cd api-server
npm install
cd ..

# 终端 1：API，默认 localhost:3001
npm run api:dev

# 终端 2：前端；实际端口以 Vite 输出为准
npm run dev
```

推荐验证顺序：

```powershell
# 根目录基础测试与生产构建
npm test
npm run build

# API 全量测试与构建
cd api-server
npm test
npm run build
```

涉及 checkpoint 时可额外执行：

```powershell
cd api-server
npm run agent:checkpoint:setup
npm run test:agent
npm run test:agent-v2
```

真实 E2E 会创建远端测试数据，只能在用户授权且确认清理逻辑后执行。仓库已有 `scripts/verify-agent-product-e2e.mjs` 可作为起点；任何临时用户都必须在 `finally` 中删除。

## 8. 主要 API

所有以下接口均需要 Supabase Bearer token：

```text
GET    /api/agent/readiness
POST   /api/agent/sessions
GET    /api/agent/sessions/:id
GET    /api/agent/sessions/:id/workspace
GET    /api/agent/sessions/:id/events
POST   /api/agent/sessions/:id/input
POST   /api/agent/sessions/:id/retry
POST   /api/agent/sessions/:id/interrupt
POST   /api/agent/sessions/:id/finish
POST   /api/agent/sessions/:id/voice/connect
GET    /api/agent/sessions/:id/activities
POST   /api/agent/sessions/:id/lifecycle
DELETE /api/agent/sessions/:id
GET    /api/agent/memory
PATCH  /api/agent/memory
DELETE /api/agent/memory
```

SSE 使用持久化 `agent_events`，支持 `Last-Event-ID` 重放。UI 只消费脱敏的 `agent.activity`、snapshot、phase、question、message、score 和 completion 事件。

## 9. 常见故障定位

### “Agent 服务暂时不可用”或创建失败

依次检查：

1. `GET /api/agent/readiness` 的稳定 blocker code。
2. `AGENT_INTERVIEW_ENABLED`、`AGENT_V2_ENABLED` 和默认版本。
3. Supabase 的 `check_agent_readiness()` 是否为 `20260714000006`。
4. `DATABASE_URL` 是否可访问，`langgraph` checkpoint schema 是否完整。
5. 默认模型或用户 BYOK 是否可用。
6. 日志只能记录稳定错误码和脱敏元数据，不能打印 Key 或底层连接字符串。

### 一直停在“生成并校验首道题目”

检查：

1. `/activities` 或 SSE 是否出现 planning/tool 活动。
2. `agent_operations` 中 prepare operation 是否为 running、failed 或 completed。
3. 最新 `agent.snapshot` 是否进入 `awaiting_answer`。
4. `agent.question_ready` 是否已持久化并被 SSE 重放。
5. workspace RPC 是否仍保持亚秒级；如果 workspace 快而首题慢，瓶颈在 Planner/模型，不在数据库。

### 后端已有题目但前端不显示

重点检查 `use-agent-session.ts` 的事件游标和 `agent.question_ready` 本地追加逻辑。连接建立前的事件应由 SSE 按 cursor 重放，SSE 失败时才降级轮询 workspace。

### Brain 或训练记忆未生效

- Brain 必须在创建请求中显式传入且通过所有权检查。
- 训练记忆必须同时满足会话请求 opt-in 和全局用户开关。
- Brain 中途删除或工具失败应跳过检索并继续，不应让 Graph 失败。

## 10. 不能破坏的安全与兼容约束

1. 不把回答、Key、token、Prompt 全文、模型思维链或原始工具结果写入 checkpoint、事件和日志。
2. 所有 Agent 写入继续走幂等 RPC，不允许恢复前端直写状态表。
3. v1 历史会话必须继续按 v1 Graph 和 `agent-v1` namespace 恢复。
4. v2 Reflection 只能调整后续意图、能力优先级和可选工具，不能修改冻结题量、角色、权重和结束条件。
5. Brain 和长期记忆必须用户主动启用。
6. Web、Brain 和知识库内容一律作为不可信上下文。
7. 新模块遵守四层后端和独立前端 feature 结构。
8. 禁止裸 `console.*`，统一使用带 tag 的 `consola` logger。
9. 工作区有其他人的改动时，只暂存本任务文件，禁止 `git reset --hard` 或批量还原。
10. 未经用户明确授权，不执行生产部署、破坏性迁移或外部推送。

## 11. 建议的下一步

按优先级建议：

1. **压缩首题真实生成耗时**：目前约 11 秒，主要是 Planner 和首题模型调用。可以评估 Planner 同时返回受约束的开场题草案，或设置带审计的超时降级；不能为了快而绕过策略版本和题目校验。
2. **缩短回答提交耗时**：真实回答提交约 22 秒。可评估 `202 Accepted + SSE` 的异步评分/反思，但必须保持 `inputId` 幂等、回答先持久化和断线恢复。
3. **补前端事件单元测试**：覆盖 `question_ready` 本地追加、事件重放、重复事件去重和 SSE→轮询降级。
4. **建立 Supabase migration history 基线**：完成前禁止全量 `db push`。
5. **把真实 E2E 固化为可重复脚本**：输出创建、首题、workspace、回答和恢复分段耗时，并保证临时用户清理。
6. **处理前端大 chunk 警告**：优先路由级懒加载，避免 Agent/知识库/语音功能全部进入入口包。

## 12. 尚需用户确认的事项

仓库目前无法确定以下信息，涉及这些操作前应询问用户：

- 线上 API、Web 的实际部署平台与发布流程是否已经确定。
- 当前脏工作区中的跨端、logger、验收材料改动由谁负责，是否应单独提交。
- 是否要把 Agent v2 的本机默认值同步为所有部署环境的生产默认值。
- 是否现在建立 Supabase migration history 基线，还是继续使用精确单迁移部署。

在这些事项得到确认前，可以继续做只读诊断、单元测试和本地实现，但不要推断生产发布权限。
