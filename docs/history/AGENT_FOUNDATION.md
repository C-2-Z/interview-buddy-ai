# Interview Agent Phase 1–7 完整实现与本地切换（历史归档）

> **已退役：** 本文描述 Agent v1 基础链路，不可作为当前实现依据。请阅读 `docs/NEXT_AI_AGENT_V3_HANDOFF_2026-07-15.md`。

本文记录 `docs/AGENT_APPLICATION_IMPLEMENTATION_PLAN.md` 的 Phase 1–7 已实现范围、运行方式和安全边界。

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

Phase 2 已建立：

- 固定 allowlist 的 Skill、简历摘要、公共题库、消息引用、量表和 Web Search 只读工具边界。
- Tavily 项目 Adapter，以及无 Key、超时、空结果和外部错误的继续面试降级。
- company / role / industry 三类固定研究查询，HTML/隐藏块/控制字符清洗、2,000 字限长、SHA-256 去重和会话缓存。
- 网页内容以不可执行数据传给模型；题量、角色、能力维度和结束条件全部由确定性代码控制。
- 单角色和技术 → 主管 → HR 固定面板能力蓝图，3–10 题完整覆盖。
- 公共题库优先、模型兜底的动态选题，以及 ID、规范文本和主题标签去重。
- `agent_plan`、`agent_research_sources` 和题目来源元数据；准备 RPC 在一个事务提交计划、研究、首题、事件和会话投影。
- Agent 题目浏览器直写锁定为 legacy-only，研究来源通过会话所有权 RLS 隔离。

Phase 3 已建立：

- 正式节点边界：`hydrate_context → research_context → build_interview_plan → select_question → wait_for_input → guard_input → extract_evidence → decide_followup → interviewer_respond → score_question → advance_stage → finalize_report`。
- 回答正文先由 `receive:<inputId>` receipt 原子写入业务消息和事件，Graph checkpoint 只保存 inputId。
- 空输入、复制题目、提示注入和超长回答的确定性 Guard；redirect 不占用追问次数。
- 有效回答按最低证据信号决定追问，每题最多三轮；Persona 驱动追问由真实多模型/BYOK Adapter 输出严格 JSON。
- 动态后续题继续题库优先、模型兜底，并通过 `question:<index>` 防止恢复重放重复插题。
- 单角色和技术 → 主管 → HR 面板均能完成全部冻结题目，角色交接与题目事件在数据库事务中提交。
- 迁移期旧写接口曾委托 Canonical Agent；Phase 7 已删除这些兼容写入口，只保留历史 GET。

Phase 4 已建立：

- `extract_evidence` 只从当前题候选人消息提取逐字 quote，并校验消息所有权、冻结维度和原文子串。
- `score_question` 只读取冻结题目、量表和合法证据；Zod 拒绝未知维度、越界分数和伪造 evidenceId。
- 模型只输出逐维评分，代码按冻结权重计算总分；无证据维度必须明确标记“证据不足”。
- 非法模型输出只允许一次修复；再次非法会写入 `evaluation_failed`，不会静默生成兜底分数。
- `commit_agent_question_evaluation` 在一个事务提交证据、版本化评分、旧题目投影、事件和幂等操作；失败记录可被合法重试原位覆盖。
- `finalize_report` 只聚合全部 `completed` 冻结评分，由代码生成总分、维度汇总和反馈，不重新调用模型评分。
- 最终报告一次性投影到旧 `overall_score`、`overall_feedback`、`dimension_summary` 与 `report_status`，并发出完整 `agent.session_completed` 事件。
- 出题、追问、证据提取和评分模型调用均记录脱敏 `agent_runs`：模型、Prompt 版本、Token、耗时、尝试序号和稳定错误码。
- 数据库脱敏规则允许能力蓝图的合法 `dimensions[].key`，仍拒绝 `apiKey`、Token、Password、Authorization 等具体敏感键。

Phase 5 已建立：

- `VoiceProvider` 把 Qwen ASR/TTS 封装为通道能力，Graph 与业务 Service 不依赖 Qwen 类型。
- ASR 最终文本使用稳定 `voice:<turnId>` 进入与文本完全相同的 `submitInput`；重复 turn 不推进 Graph，也不重复 TTS。
- WebSocket 只翻译持久 `agent.*` 事件，不再拥有独立追问、评分或结束决策。
- 单个 Qwen TTS 长连接支持多轮 speak；打断同时取消浏览器播放、服务端 PCM 流和 Provider 会话。
- 断线重连只读取当前题目和工作台投影，不评分、不跳题；最终语音事件使用冻结报告真实得分。

Phase 6 已建立：

- `/new` 和 `/session/:id` 是统一 Agent 新建与工作台入口，文本/语音由冻结 `interviewMode` 决定。
- 前端 SSE 使用带 Supabase Bearer 的 fetch 流，支持 `Last-Event-ID`，失败时轮询工作台降级。
- 工作台展示真实题目、消息、角色、阶段、研究来源、回答证据、逐题评分和最终冻结报告。
- 语音采集、PCM 播放、打断和重连已合并到 Agent Feature，不再维护第二套语音页面状态机。
- 旧会话仍出现在历史列表，但只能进入 `/legacy/:id` 只读查看答案、评分和反馈。

Phase 7 已建立：

- 新建、输入、评分和报告只保留 `/api/agent/sessions` Canonical 写链路；旧 sessions API 只保留历史 GET。
- 删除 BullMQ/Redis 渐进生成、旧问题对话/评分、旧语音决策和对应前端页面；公共题库、简历、设置继续复用。
- `AGENT_INTERVIEW_ENABLED` 仍按原计划作为安全灰度闸门；关闭时禁止新建，绝不回退旧写流程。
- 缺少 `DATABASE_URL` 时拒绝创建生产 Graph，不允许 MemorySaver 产生重启后不可恢复的业务会话。

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
supabase/migrations/20260712000001_add_agent_preparation.sql
supabase/migrations/20260712000002_add_agent_text_input.sql
supabase/migrations/20260712000003_add_agent_question_progression.sql
supabase/migrations/20260712000004_add_agent_evaluation.sql
supabase/migrations/20260712000005_add_agent_report.sql
supabase/migrations/20260712000006_add_agent_run_audit.sql
```

该迁移只应在隔离的本地或测试数据库演练。根据项目交接约束，禁止在没有用户再次授权时运行 `supabase db push`、`db reset` 或 `migration repair`。

为 LangGraph checkpoint 配置独立 PostgreSQL 连接和私有 schema：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ezmock
AGENT_ALLOW_MEMORY_CHECKPOINTER=0
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

没有本地 PostgreSQL 的开发机可显式设置 `AGENT_ALLOW_MEMORY_CHECKPOINTER=1`。该模式仅在非
`production` 环境生效，API 重启后 checkpoint 不可恢复；生产环境无论该开关为何值都必须提供
`DATABASE_URL`。

## Canonical Agent API

```text
POST /api/agent/sessions
GET  /api/agent/sessions/:sessionId
GET  /api/agent/sessions/:sessionId/workspace
POST /api/agent/sessions/:sessionId/input
POST /api/agent/sessions/:sessionId/interrupt
POST /api/agent/sessions/:sessionId/finish
POST /api/agent/sessions/:sessionId/retry
POST /api/agent/sessions/:sessionId/voice/connect
GET  /api/agent/sessions/:sessionId/events
GET  /api/sessions
GET  /api/sessions/:sessionId
```

文本输入必须携带稳定 `inputId`。API 在恢复 Graph 前原子 claim `input:<inputId>`；重复或并发请求不会第二次推进 Graph。回答正文先持久化到业务消息，`Command.resume` 只传输入 ID。

## 验证

```powershell
Set-Location api-server
npm test
npm run build
Set-Location ..
npx tsc --noEmit
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

本地 Phase 2 验收再次从旧表桩启动临时 PostgreSQL，连续执行两次准备迁移，并验证：

- `commit_agent_preparation` 原子写入冻结计划、清洗来源、业务首题和三个有序事件。
- 相同 preparation operation 重放不重复创建题目、研究或事件。
- 其他用户无法读取研究来源，authenticated 客户端无法绕过 RPC 写 Agent 题目。

本地 Phase 4 验收从完整历史结构启动临时真实 PostgreSQL，并验证：

- `evaluation_failed` 可由唯一合法重试覆盖，评分重放仍只有一份证据、评分与 `agent.score_completed` 事件。
- 伪造 quote、未知证据引用和不完整冻结评分由应用与数据库双层拒绝。
- 报告仅在冻结评分数量等于冻结题量时完成，重放不产生第二份 `agent.session_completed`。
- 旧题目、雷达维度和会话报告投影与冻结评分一致。
- 同一模型操作的失败/成功尝试分别审计，Prompt 版本、Token、耗时可追踪，含 `apiKey` 的审计载荷被拒绝。

本地 Phase 5–7 门禁还验证：

- 同一语音 turn 使用相同 inputId，重复提交返回零新增播报事件。
- Qwen mock 的单 TTS 会话连续多轮 speak，打断时 Agent 与 Provider 均收到取消。
- 前端 TypeScript、客户端/SSR 生产构建和后端 TypeScript 构建通过。
- 后端测试清单不再引用已删除 legacy 文件，后端裸 `console.*` 为 0。
- 临时真实 PostgreSQL 完成 50 个并发创建且会话/首快照均为 50 份唯一记录；100 个并发事件恢复读取耗时 28ms，事件循环最大观测延迟 15ms。
