# ezmock LangGraph Agent 应用实施与交接计划（历史归档）

> **已退役：** 本文描述早期 Agent v1 方案，不可作为当前实现依据。请阅读 `docs/NEXT_AI_AGENT_V3_HANDOFF_2026-07-15.md`。

> 文档状态：已完成架构决策，可直接交给其他 AI 或工程师继续实施。
> 编写日期：2026-07-11
> 目标代码基线：`codex/performance-local@1e6ab0a`
> 编写本文档时工作区分支：`cys`（不要在此旧分支直接实施 Agent 改造）

## 1. 交接摘要

### 1.1 目标

把 ezmock 从分散在文本 Service、语音 WebSocket、BullMQ Worker 和评分模块中的多套流程，重构为一个由 LangGraph 驱动的、可持久化、可恢复、可审计的面试 Agent 应用。

最终同时支持：

- LangGraph 受控工作流。
- 单面试官角色扮演。
- 技术面试官、主管和 HR 固定阶段接力的多角色面板。
- 基于回答证据的多维评分与代码加权聚合。
- 文本和 Qwen 实时语音统一进入同一 Agent 状态机。
- 面试开始前的联网岗位与公司研究。
- Checkpoint、SSE 重连、Worker 重启和幂等恢复。
- 旧面试记录只读兼容。

### 1.2 实施前必须确认的基线

当前已知最完整的本地代码位于：

```text
branch: codex/performance-local
commit: 1e6ab0a
message: feat(integration): 合并远端修复与本地性能功能
```

该提交同时包含：

- 本地渐进出题、BullMQ、SSE、低延迟语音和统一日志。
- GitHub `main@2e7cf4c` 的 Supabase WebSocket 初始化修复。
- 多维评分、核心工作台、简历解析、多模型和语音面试等历史主线能力。

接手者第一步必须执行只读检查：

```powershell
git status --short --branch
git show -s --oneline HEAD
git branch --list
```

如果目标分支仍在且工作区干净，应切换到 `codex/performance-local` 后再开始实现。不要重置、覆盖或清理 `main`、`cys` 及用户已有分支。

### 1.3 当前能力盘点

可直接复用的能力：

- Hono API 与 Routes / Service / Repository / Schema 四层模块结构。
- DeepSeek、OpenAI、Anthropic 多模型和用户 API Key 加密存储。
- Skill、题库、简历解析、岗位描述和渐进生成。
- `interview_messages` 多轮消息表。
- 多维度评分、雷达图、综合报告。
- BullMQ、Redis、Outbox、生成 Worker、SSE 与轮询降级。
- Qwen ASR/TTS/Realtime、持久 TTS、ASR 预热、语音打断和 AudioWorklet 播放。
- `consola` 统一日志和敏感字段脱敏。

现有问题：

- 文本和语音拥有各自的流程决策逻辑。
- 会话状态、Worker 状态和消息状态缺少统一的 Agent State。
- LLM 同时承担对话、流程判断和部分评分职责，可复现性不足。
- 评分缺少显式回答证据链和版本化量表。
- SSE 主要投影生成进度，尚未形成统一 Agent 事件流。
- 进程重启后可恢复的数据与进程内语音状态之间仍存在边界。

## 2. 已锁定的产品与技术决策

以下决策已经由用户确认，实施者不得重新选择其他方向：

| 决策点 | 已选方案 |
|---|---|
| 交付方式 | 一次性替换新会话主流程，不长期并行维护两套可写状态机 |
| Agent 自主度 | 受控工作流，代码控制题量、追问、评分和结束条件 |
| 角色体验 | 同时支持单面试官和多角色面板 |
| 多角色编排 | 固定阶段接力 |
| 默认角色比例 | 技术 60% + 主管 25% + HR 15% |
| 旧数据 | 旧记录只读兼容，不批量迁移为 Checkpoint |
| Checkpoint | 现有 Supabase PostgreSQL |
| 评分 | 证据提取 + AI 维度评分 + 代码校验与聚合 |
| 语音 | 保留 Qwen，并抽象 Voice Provider 接口 |
| 联网检索 | 面试开始前检索，不在每题实时检索 |
| 搜索实现 | 项目内 `WebSearchProvider`，默认 Tavily |
| 可观测性 | 项目内追踪为主，LangSmith 仅作可选开发开关 |

## 3. 目标架构

### 3.1 总体数据流

```text
创建面试
  ↓
Agent Preparation Worker
  ├─ 加载岗位、简历、Skill、题库
  ├─ 联网研究公司和岗位
  ├─ 构建能力覆盖蓝图
  └─ 构建角色与题量计划
  ↓
LangGraph Interview Graph
  ├─ 选择当前角色和题目
  ├─ 输出面试官消息
  ├─ interrupt 等待文本或语音回答
  ├─ 输入安全检查
  ├─ 提取回答证据
  ├─ 决定追问或评分
  ├─ 冻结题目评分
  ├─ 下一题或角色交接
  └─ 完成并生成报告
  ↓
Supabase 业务投影 + LangGraph Checkpoint + Agent Events
```

### 3.2 模块边界

后端新增独立模块：

```text
api-server/src/modules/interview-agent/
├── interview-agent.routes.ts
├── interview-agent.service.ts
├── interview-agent.repository.ts
├── interview-agent.schemas.ts
├── interview-agent.types.ts
├── graph/
├── roles/
├── tools/
├── providers/
├── events/
└── queue/
```

前端新增独立 Feature：

```text
src/features/interview-agent/
├── api.ts
├── types.ts
├── hooks/
└── components/
```

必须继续遵守项目约束：

- 新功能不得塞入已有功能域。
- 路由保持薄入口。
- 后端路由、业务、数据库和校验分层。
- 新模块注册到 `api-server/src/app.ts`。
- 前端页面路由只导入 Feature 页面组件。
- 不允许新增裸 `console.*`。

### 3.3 依赖方案

在 API Server 安装并锁定实际解析版本：

```text
@langchain/langgraph
@langchain/core
@langchain/langgraph-checkpoint-postgres
pg
@langchain/tavily
```

不在第一版迁移现有模型调用到 LangChain ChatModel。继续使用当前 `ai-client`，通过 Agent Model Adapter 调用，以保留：

- 多模型兼容。
- 用户自带 API Key。
- 当前超时、流式输出和思考模式配置。
- 当前性能埋点和错误处理。

## 4. Agent 状态、角色与图编排

### 4.1 核心状态

```typescript
type AgentMode = "single" | "panel";

type AgentPhase =
  | "preparing"
  | "awaiting_answer"
  | "reasoning"
  | "speaking"
  | "scoring"
  | "role_handoff"
  | "reporting"
  | "completed"
  | "failed";

type RoleId = "general" | "technical" | "manager" | "hr";

type InterviewAgentState = {
  version: "agent-v1";
  sessionId: string;
  userId: string;
  mode: AgentMode;
  phase: AgentPhase;
  config: FrozenAgentConfig;
  rolePlan: RoleStage[];
  currentRole: RoleId;
  currentQuestionId: string | null;
  currentQuestionIndex: number;
  followUpCount: number;
  coveredDimensions: string[];
  latestInputId: string | null;
  latestEvidenceIds: string[];
  pendingAction:
    | "ask"
    | "follow_up"
    | "score"
    | "handoff"
    | "finish";
};
```

Checkpoint 中禁止存放：

- API Key、Authorization 和数据库凭据。
- PCM 或其他原始音频。
- 完整简历文件。
- 未脱敏模型报文。
- 可以从业务表按 ID 重新加载的大型历史对象。

### 4.2 Persona

```typescript
type RolePersona = {
  id: RoleId;
  displayName: string;
  goals: string[];
  tone: string;
  allowedTopics: string[];
  prohibitedBehaviors: string[];
  rubricOverrides: Record<string, number>;
  promptVersion: string;
};
```

角色规则：

- `general`：单面试官模式，负责完整面试体验。
- `technical`：技术深度、项目证据、实现细节和系统权衡。
- `manager`：业务场景、优先级、协作、风险和决策过程。
- `hr`：动机、行为、沟通、职业规划和价值观匹配。
- Persona 只影响提问风格、可问范围和维度权重，不允许改变总题数、追问上限和结束条件。

多角色题量分配：

- 三个角色各先分配一题。
- 剩余题目按 60% / 25% / 15% 使用最大余数法分配。
- 题数范围继续为 3–10。
- 角色按技术 → 主管 → HR 固定接力。

### 4.3 图节点

必须实现以下节点：

1. `hydrate_context`：加载会话、简历摘要、Skill 和冻结配置。
2. `research_context`：执行开场前联网研究或降级跳过。
3. `build_interview_plan`：生成能力覆盖蓝图、角色计划和首题。
4. `select_question`：题库优先，模型生成兜底，避免重复主题。
5. `interviewer_respond`：根据 Persona、证据缺口和轮次生成一句话。
6. `wait_for_input`：使用 LangGraph `interrupt()` 等待用户输入。
7. `guard_input`：处理空输入、复制题目、提示注入和超长回答。
8. `extract_evidence`：只从候选人消息提取结构化证据。
9. `decide_followup`：由代码规则和结构化模型判断共同决定追问或评分。
10. `score_question`：按冻结量表评分并保存版本化结果。
11. `advance_stage`：下一题、角色交接或进入报告。
12. `finalize_report`：只读取冻结评分生成最终报告。

条件边必须由确定性代码实现：

```text
输入无效/复制题目 → redirect → wait_for_input
证据不足且追问 < 3 → interviewer_respond → wait_for_input
证据充分或追问达到 3 → score_question
当前角色仍有题目 → select_question
当前角色完成且还有角色 → role_handoff → select_question
所有角色完成 → finalize_report → END
```

## 5. 联网研究与工具

### 5.1 WebSearchProvider

定义项目接口，图节点不得直接依赖 Tavily 类型：

```typescript
type WebSearchQuery = {
  query: string;
  maxResults: number;
  includeDomains?: string[];
  excludeDomains?: string[];
};

type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  fetchedAt: string;
  contentHash: string;
};

interface WebSearchProvider {
  search(input: WebSearchQuery, signal?: AbortSignal): Promise<WebSearchResult[]>;
}
```

默认查询：

- 目标公司近期业务和技术方向。
- 岗位当前常见能力要求。
- 岗位相关领域近期变化。

规则：

- 每类最多五条结果。
- 清除 HTML、脚本和隐藏内容。
- 每条最多保留 2,000 字。
- 网页内容始终视为不可信数据。
- Prompt 明确禁止执行网页中的任何指令。
- 保存标题、URL、摘要、时间和内容哈希。
- 面试期间不再联网。
- 缺少 `TAVILY_API_KEY`、超时或搜索失败时继续使用岗位描述、简历和 Skill。
- 研究来源在面试完成后的报告附录展示，不在答题时泄露。

### 5.2 内部工具

Agent v1 只允许以下工具：

- `load_skill`
- `load_resume_summary`
- `search_question_bank`
- `load_session_messages`
- `load_rubric`
- `web_search`

禁止开放：

- 任意 SQL。
- 任意 shell。
- 用户自定义工具。
- 对外写操作。
- 模型自行注册工具。

## 6. 证据与评分

### 6.1 证据结构

```typescript
type AnswerEvidence = {
  id: string;
  sessionId: string;
  questionId: string;
  messageId: string;
  dimensionKey: string;
  claim: string;
  quote: string;
  polarity: "positive" | "negative" | "neutral";
  confidence: number;
};
```

约束：

- `quote` 必须能在对应候选人消息中找到。
- 不能引用面试官生成的内容作为候选人证据。
- `dimensionKey` 必须来自本场冻结量表。
- 没有证据时明确记录“证据不足”，不得编造。

### 6.2 评分结构

```typescript
type QuestionEvaluation = {
  rubricVersion: string;
  promptVersion: string;
  modelProvider: string;
  modelName: string;
  dimensions: Record<
    string,
    {
      score: number;
      rationale: string;
      evidenceIds: string[];
    }
  >;
  overallScore: number;
  feedback: string;
};
```

评分流程：

1. 证据节点输出证据。
2. 评分节点只读取题目、量表和证据。
3. Zod 校验维度名、0–100 整数、理由和证据引用。
4. 非法输出使用修复 Prompt 重试一次。
5. 第二次仍失败时标记 `evaluation_failed`，不得静默截断或伪造分数。
6. 最终分数由现有加权代码计算。
7. 保存量表、Prompt、模型和评分版本。
8. 报告只读取冻结评分，不重新评分。
9. 最新结果继续投影到现有 `score`、`feedback`、`dimension_scores` 和 `dimension_summary`，复用当前报告 UI。

## 7. 数据库与一致性

### 7.1 业务表变更

新增或扩展：

- `interview_sessions`
  - `agent_version`
  - `agent_mode`
  - `agent_phase`
  - `current_role`
  - `agent_config jsonb`
  - `thread_id`
  - `research_status`
  - `last_event_seq`
- `agent_events`
  - `session_id`
  - `sequence`
  - `type`
  - `payload jsonb`
  - `created_at`
  - 唯一约束 `(session_id, sequence)`
- `agent_operations`
  - 幂等 `operation_key`
  - 节点名、状态和序列化结果
- `agent_runs`
  - 节点、尝试次数、状态、耗时、Token、模型、错误、输入哈希和输出摘要
- `agent_research_sources`
- `answer_evidence`
- `question_evaluations`
- `interview_messages`
  - `role_id`
  - `agent_run_id`
  - `sequence`
  - `message_kind`

所有新表启用 RLS。用户只能访问属于自己会话的数据；Checkpoint 表只允许服务端数据库连接访问。

### 7.2 LangGraph Checkpoint

- 新增服务器变量 `DATABASE_URL`，使用 Supabase PostgreSQL 直连或连接池地址。
- `PostgresSaver` 使用私有 `langgraph` schema。
- 新增 `npm run agent:checkpoint:setup`。
- `setup()` 只在显式初始化命令中运行，不能在请求启动时自动执行 DDL。
- `thread_id = sessionId`。
- `checkpoint_ns = agent-v1`。
- 删除会话时调用 `deleteThread(sessionId)`，再清理事件、证据、研究和运行记录。

### 7.3 幂等与恢复

- 每次文本输入必须携带唯一 `inputId`。
- 每次语音输入直接使用 `turnId` 作为 `inputId`。
- 每个有副作用的节点生成确定性 `operationKey`。
- 业务投影和 `agent_events` 通过数据库 RPC 在同一事务提交。
- 若业务写入成功但 Checkpoint 失败，节点重放时先查询 `operationKey` 并返回已有结果。
- 重试不得重复插入消息、题目、证据和评分。
- BullMQ 只负责调度，不作为业务状态真相。

## 8. API 与事件协议

### 8.1 Canonical API

```text
POST /api/agent/sessions
GET  /api/agent/sessions/:sessionId
POST /api/agent/sessions/:sessionId/input
POST /api/agent/sessions/:sessionId/interrupt
POST /api/agent/sessions/:sessionId/finish
POST /api/agent/sessions/:sessionId/retry
GET  /api/agent/sessions/:sessionId/events
```

创建请求：

```typescript
type CreateAgentSessionBody = {
  mode: "single" | "panel";
  interviewMode: "text" | "voice";
  position: string;
  difficulty: "初级" | "中级" | "高级";
  questionCount: number;
  jobDescription?: string;
  targetCompany?: string;
  skillId?: string;
  resumeId?: string;
  modelProvider?: "deepseek" | "openai" | "anthropic";
  modelName?: string;
  webResearch?: boolean;
};
```

创建响应使用 HTTP 202：

```typescript
{
  sessionId: string;
  threadId: string;
  phase: "preparing";
  eventCursor: number;
}
```

文本输入：

```typescript
{
  inputId: string;
  type: "text";
  content: string;
}
```

### 8.2 SSE 事件

```typescript
type AgentEvent =
  | { sequence: number; type: "agent.snapshot"; data: AgentSnapshot }
  | { sequence: number; type: "agent.phase"; data: { phase: AgentPhase } }
  | { sequence: number; type: "agent.role_changed"; data: RoleStage }
  | { sequence: number; type: "agent.question_ready"; data: QuestionView }
  | { sequence: number; type: "agent.message_delta"; data: MessageDelta }
  | { sequence: number; type: "agent.message_completed"; data: MessageView }
  | { sequence: number; type: "agent.score_completed"; data: ScoreView }
  | { sequence: number; type: "agent.session_completed"; data: ReportView }
  | { sequence: number; type: "agent.error"; data: AgentError };
```

SSE 必须支持：

- 初次连接先返回 Snapshot。
- `Last-Event-ID` 重放遗漏事件。
- 15 秒 Ping。
- SSE 失败后前端每 2 秒轮询 Snapshot。
- 重复 `inputId` 返回已有结果。
- 事件只从已提交的 `agent_events` 投影。

### 8.3 旧接口兼容

- 旧 `GET /api/sessions` 和 `GET /api/sessions/:id` 继续返回统一历史记录。
- 旧 `POST /api/sessions` 委托 Agent 创建，避免旧客户端立即失效。
- 新 Agent 会话调用旧消息接口时转发到 Agent input。
- 旧会话只读，继续发送或评分返回 HTTP 409 和 `legacy_session_read_only`。
- 切换完成后删除旧文本和语音中的流程决策代码，只保留旧记录读取、Repository 和可复用纯函数。

## 9. 统一语音链路

语音数据流：

```text
PCM
→ VoiceProvider ASR
→ transcript
→ Agent input / Command(resume)
→ Agent message events
→ VoiceProvider TTS
→ PCM
```

Provider 接口：

```typescript
interface VoiceProvider {
  createAsrSession(input: AsrSessionConfig): StreamingAsrSession;
  createTtsSession(input: TtsSessionConfig): StreamingTtsSession;
  speak(input: SpeakInput, signal?: AbortSignal): AsyncIterable<Buffer>;
  interrupt(turnId: string): Promise<void>;
  close(): Promise<void>;
}
```

要求：

- Qwen 为首版默认实现。
- 原始音频不写 Checkpoint、数据库事件或日志。
- ASR 最终文本与文本输入走同一图节点。
- 打断同时取消 LLM 流、TTS 和当前 AbortSignal。
- 被打断的 assistant message 标记 `interrupted=true`。
- 打断不撤销已提交用户消息。
- WebSocket 重连后从 Agent Snapshot 恢复。
- 保留 `<speech>/<decision>` 单次流式解析，但决策仍需经过 Zod 和 Graph 状态规则。

## 10. 前端改造

创建独立 `interview-agent` Feature，并逐步复用现有组件。

创建页：

- 增加单面试官/多角色选择。
- 增加联网研究开关。
- 保留岗位、难度、简历、Skill、模型和语音模式配置。

准备页：

- 展示研究、角色规划和首题生成阶段。
- 不展示具体研究内容和潜在答案。

面试页：

- 文本和语音共享 Agent Snapshot 与事件协议。
- 显示当前角色、角色阶段、题目进度和 Agent Phase。
- 多角色交接显示明确过渡卡片。
- 复用 AudioWorklet、录音、播放和打断组件。
- SSE 重连后不得清空消息。

报告页：

- 综合分数和维度雷达图。
- 逐题证据、评分理由和改进建议。
- 角色分段表现。
- 联网研究来源附录。
- 旧记录显示“历史版本，只读”。

## 11. 分阶段实施计划

### Phase 1：基础设施与契约，预计 1 周

- 安装并锁定 LangGraph、Postgres Checkpoint 和搜索依赖。
- 建立 Agent 模块、状态、Persona、Schema 和事件协议。
- 增加业务迁移与本地 Checkpoint setup。
- 建立 Agent Repository、运行记录和幂等操作。
- 使用 Mock 节点跑通 `START → interrupt → resume → END`。

完成门禁：

- 本地 PostgreSQL 可保存和恢复线程。
- API 重启后能从同一 `thread_id` 恢复。
- 重复输入不产生重复事件。

### Phase 2：研究、角色和题目规划，预计 1 周

- 实现 Skill、简历、题库和 Web Search 工具。
- 实现检索清洗、引用、缓存和失败降级。
- 实现单角色与固定阶段面板计划。
- 将批量出题改为能力蓝图和动态选题。

完成门禁：

- 无 Tavily Key 时仍能准备面试。
- 3–10 题角色分配全部正确。
- 恶意网页内容不能改变系统行为。

### Phase 3：文本 Agent 主图，预计 1–1.5 周

- 实现输入 Guard、面试官、证据、追问和角色交接节点。
- 将现有文本消息流程迁入 Graph。
- 实现 SSE、Snapshot、重放和轮询降级。
- 将旧写接口委托到 Agent。

完成门禁：

- 单面试官和多角色文本面试均可完整结束。
- 每题最多三轮追问。
- Worker/API 重启后能从等待输入状态继续。

### Phase 4：评分与报告，预计 1 周

- 实现证据表、量表版本、评分修复和失败重试。
- 保留当前雷达图和报告投影。
- 报告只读取冻结评分。
- 增加模型、Prompt、Token 和耗时审计。

完成门禁：

- 每个有效维度引用真实证据或标记证据不足。
- 非法评分不会被静默接受。
- 重试不会产生两份最终评分。

### Phase 5：语音统一，预计 1–1.5 周

- 抽象 VoiceProvider 并接入现有 Qwen。
- 将 ASR 文本接入 Graph resume。
- 将 Agent 流式消息接入 TTS。
- 完成打断、断线恢复和多角色语音交接。

完成门禁：

- 单 TTS 长连接支持多轮 Speak。
- 打断后无残留音频。
- WebSocket 重连不重复评分或跳题。
- 文本和语音对相同回答产生相同状态迁移。

### Phase 6：前端与旧数据兼容，预计 1 周

- 建立 Agent Feature 和统一面试页面。
- 增加角色、阶段、研究和证据展示。
- 保持旧历史与报告只读访问。
- 将全部新建入口切换到 Agent API。

### Phase 7：完整验证与本地切换，预计 1 周

- 删除或冻结旧可写状态机。
- 新会话全部进入 Agent Graph。
- 执行完整集成、恢复、语音和压测。
- 更新架构、API、环境变量、数据库和故障恢复文档。

预计周期：

- 单名熟悉 TypeScript 的开发者：7–9 周。
- 两人并行处理后端图编排与前端/语音：4–6 周。

## 12. 测试矩阵与验收标准

必须新增：

- 图路由：所有 Phase、条件边、追问上限、角色交接和结束条件。
- 幂等：重复输入、重复 Job、Checkpoint 失败、节点重放。
- 恢复：API 重启、Worker 重启、Redis 中断和 Checkpoint 恢复。
- SSE：Snapshot、`Last-Event-ID`、断线重连和轮询降级。
- 联网研究：超时、空结果、无 Key、恶意内容和重复来源。
- 评分：非法 JSON、越界分数、未知维度、虚假证据和修复失败。
- 角色：3–10 题分配、Prompt 隔离和交接连续性。
- 语音：ASR 预热、单 TTS 多轮、跨 Chunk、打断和重连。
- 旧数据：可查看但不可继续写入。
- 安全：API Key 不进入 Checkpoint、事件、日志或外部追踪。
- 权限：用户不能读取他人的事件、证据、研究和评分。

最终本地门禁：

```text
后端单元测试和集成测试：全部通过
后端 TypeScript 构建：通过
前端 Vite + SSR 构建：通过
git diff --check：通过
后端裸 console.*：0
50 并发创建：通过
100 SSE 连接：通过
SSE 重连恢复：2 秒内
重复消息/题目/评分：0
API 持续事件循环阻塞：不得超过 200ms
文本 TTFT P95：不高于当前基线 15%
TTS 首包 P95：不高于当前基线 15%
```

## 13. 环境变量

计划新增：

```text
DATABASE_URL=
AGENT_INTERVIEW_ENABLED=0
AGENT_CHECKPOINT_SCHEMA=langgraph
AGENT_PROMPT_VERSION=agent-v1
AGENT_EVENT_RETENTION_DAYS=90
AGENT_MAX_NODE_RETRIES=2
AGENT_WEB_RESEARCH_ENABLED=1
AGENT_WEB_RESEARCH_TIMEOUT_MS=10000
TAVILY_API_KEY=
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=
```

规则：

- `AGENT_INTERVIEW_ENABLED=0` 时禁止创建新 Agent 会话，但不能回退到旧可写流程。
- LangSmith 默认关闭。
- 所有 Key 只在服务端读取。
- 用户模型 API Key 继续使用现有加密存储，不写入 Agent State。

## 14. 明确禁止事项

在用户再次授权之前，不得执行：

```text
git push
git push --force
supabase db push
supabase db reset
supabase migration repair
railway up / deploy / redeploy / delete
vercel / vercel --prod / vercel deploy
任何生产环境变量修改
任何生产数据库写操作
修改、停止或删除 Railway Redis
创建新的 Vercel 项目或修改 ezmock.site 域名
```

也不得清理、重置或覆盖本地 `main`、`cys` 和用户已有分支。

所有开发、迁移演练、Redis、Supabase 和语音测试必须先在本地或 Mock 环境完成。

## 15. 接手 AI 的首个执行任务

接手后不要直接写完整 Agent。首个任务固定为 Phase 1 的最小可验证骨架：

1. 确认并切换到 `codex/performance-local@1e6ab0a`，确保工作区干净。
2. 创建新的 `codex/agent-langgraph-foundation` 本地分支。
3. 阅读本文件、`AGENTS.md`、`WORK_HANDOFF.md`、`DEPLOYMENT.md` 和现有会话/语音/评分模块。
4. 安装并锁定 LangGraph 与 PostgreSQL Checkpoint 依赖。
5. 创建完整 `interview-agent` 模块骨架。
6. 定义 `InterviewAgentState`、Schema 和最小事件类型。
7. 建立本地 `PostgresSaver` 初始化命令。
8. 只使用 Mock 节点跑通：

```text
START
→ prepare
→ ask
→ interrupt
→ resume(user input)
→ complete
→ END
```

9. 验证 API 重启后恢复、重复 `inputId` 幂等和 SSE Snapshot。
10. 运行后端测试、后端构建、前端构建和 `git diff --check`。

Phase 1 骨架未通过前，不得开始联网研究、多角色、正式评分或语音迁移。

## 16. 官方参考

- LangGraph JavaScript 概览：<https://docs.langchain.com/oss/javascript/langgraph/overview>
- LangGraph 持久化：<https://docs.langchain.com/oss/javascript/langgraph/persistence>
- LangGraph Interrupts：<https://docs.langchain.com/oss/javascript/langgraph/interrupts>
- LangGraph Streaming：<https://langchain-ai.github.io/langgraphjs/concepts/streaming/>
- PostgreSQL Checkpointer：<https://langchain-ai.github.io/langgraphjs/reference/modules/langgraph-checkpoint-postgres.html>
- LangChain 多 Agent 模式：<https://docs.langchain.com/oss/javascript/langchain/multi-agent>
- Tavily JavaScript 集成：<https://docs.langchain.com/oss/javascript/integrations/tools/tavily_search>
