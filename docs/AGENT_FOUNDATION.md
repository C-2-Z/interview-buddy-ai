# Interview Agent Phase 1 基础设施

本文记录 `docs/AGENT_APPLICATION_IMPLEMENTATION_PLAN.md` 的 Phase 1 已实现范围、运行方式和安全边界。

## 当前范围

Phase 1 已建立：

- LangGraph `StateGraph` 最小受控流程：`START → prepare → ask → interrupt → resume → complete → END`。
- `thread_id = sessionId`、`checkpoint_ns = agent-v1`。
- PostgreSQL `PostgresSaver` 运行时工厂和显式 setup 命令。
- 单面试官与技术/主管/HR 固定阶段角色计划，面板题量使用 60% / 25% / 15% 最大余数法。
- `/api/agent/sessions` Canonical API、数据库事件流、SSE Snapshot、`Last-Event-ID` 重放和 15 秒 Ping。
- `agent_operations` claim/commit/fail 幂等账本，以及会话投影与事件同事务提交。
- Agent 会话、事件、操作和运行审计表的 RLS；Agent 会话不能由浏览器绕过 RPC 直接写入或删除。
- 冻结配置、事件、操作结果和 checkpoint 的敏感字段拒绝。

Phase 1 仍使用确定性 Mock 模型节点。联网研究、正式文本主图、证据评分、报告、统一语音和前端 Agent 页面必须按后续 Phase 顺序接入；`AGENT_INTERVIEW_ENABLED` 默认关闭，不会回退到旧可写流程。

## 后端依赖

API Server 当前锁定的解析版本：

```text
@langchain/core                         1.2.2
@langchain/langgraph                    1.4.7
@langchain/langgraph-checkpoint-postgres 1.0.4
@langchain/tavily                       1.2.0
pg                                      8.22.0
zod                                     3.25.76
```

## 本地数据库初始化

业务迁移文件：

```text
supabase/migrations/20260711000002_add_interview_agent_foundation.sql
```

该迁移只应在隔离的本地或测试数据库演练。根据项目交接约束，禁止在没有用户再次授权时运行 `supabase db push`、`db reset` 或 `migration repair`。

为 LangGraph checkpoint 配置独立 PostgreSQL 连接和私有 schema：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ezmock
AGENT_CHECKPOINT_SCHEMA=langgraph
```

首次只通过显式命令建 checkpoint 表：

```powershell
Set-Location api-server
npm run agent:checkpoint:setup
```

API 启动和请求路径不会调用 `setup()` 或隐式执行 DDL。`AGENT_CHECKPOINT_SCHEMA` 只接受 `^[a-z_][a-z0-9_]*$`。

## 功能开关

```env
AGENT_INTERVIEW_ENABLED=0
AGENT_PROMPT_VERSION=agent-v1
AGENT_EVENT_RETENTION_DAYS=90
AGENT_MAX_NODE_RETRIES=2
AGENT_WEB_RESEARCH_ENABLED=1
AGENT_WEB_RESEARCH_TIMEOUT_MS=10000
TAVILY_API_KEY=
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=
```

只有 `AGENT_INTERVIEW_ENABLED=1` 才允许创建新 Agent 会话。关闭开关不会阻止读取或恢复已有 Agent 会话。

## Phase 1 API

```text
POST /api/agent/sessions
GET  /api/agent/sessions/:sessionId
POST /api/agent/sessions/:sessionId/input
POST /api/agent/sessions/:sessionId/interrupt
POST /api/agent/sessions/:sessionId/finish
POST /api/agent/sessions/:sessionId/retry
GET  /api/agent/sessions/:sessionId/events
```

文本输入必须携带稳定 `inputId`。API 在恢复 Graph 前原子 claim `input:<inputId>`；重复或并发请求不会第二次推进 Graph。Phase 1 不把回答正文传入 `Command.resume`，只传已持久化输入的 ID。正式正文落表将在 Phase 3 完成。

## 验证

```powershell
Set-Location api-server
npm test
npm run build
Set-Location ..
npm run build
git diff --check
```

需要外部 PostgreSQL 的集成用例使用隔离变量：

```env
AGENT_TEST_DATABASE_URL=postgresql://...
```

本地 Phase 1 验收还使用临时嵌入式 PostgreSQL 完成了两项一次性门禁：

- `PostgresSaver setup → interrupt → 关闭连接池 → 重建 → resume → END → deleteThread`。
- 从旧表桩执行完整业务迁移，验证 create/claim/commit、严格事件序列、重复操作、Snapshot 游标、简历所有权、敏感键拒绝和 legacy-only 写 RLS。
