# 下一位 AI 交接文档：产品体验与业务闭环重设计

> 本文用于让下一位 AI 在不重新推断上下文的情况下，安全继续 AI 面试模拟器的产品重设计。

## 1. 当前任务目标

技术 Agent 重构已经完成。下一阶段不是继续扩展底层 Agent 节点，而是把现有能力包装成普通求职者能理解、能开始、能完成、能复练的成熟产品。

产品审计与完整任务计划见：

- `docs/PRODUCT_EXPERIENCE_REDESIGN_PLAN.md`
- `docs/AGENT_APPLICATION_IMPLEMENTATION_PLAN.md`
- `docs/AGENT_FOUNDATION.md`

如果三者发生冲突：

1. 安全、持久化和 Agent 单一写状态机以 `AGENT_APPLICATION_IMPLEMENTATION_PLAN.md` 为准。
2. 用户流程、信息架构和后续优先级以 `PRODUCT_EXPERIENCE_REDESIGN_PLAN.md` 为准。
3. 当前实现和验证命令参考 `AGENT_FOUNDATION.md`。

## 2. 当前 Git 和工作区状态

- 工作区：`C:\Users\cys\ezmock`
- 分支：`codex/agent-langgraph-foundation`
- Agent 主重构提交：`c35b88a`
- 本地 checkpoint 兼容修复：`6f90ae7`
- 用户已于 2026-07-13 明确授权后端数据库和远端改动，以完成真实项目验收；仍未授权或执行 Git push 与生产部署。
- 用户原有未跟踪文件 `项目周报_choice-whu_2026-07-07至2026-07-13.md` 不属于本任务，禁止删除或纳入提交。

## 3. 已完成的能力

- LangGraph 是新面试的唯一写状态机。
- 支持单面试官和技术/主管/HR 固定阶段面板。
- 支持文本和 Qwen 语音桥接。
- 支持 Supabase 业务事件、SSE 重放、幂等输入、证据评分、冻结报告和模型审计。
- 支持岗位研究、简历摘要、题库优先和模型生成兜底。
- 前端已有创建页、统一面试工作台、历史记录、简历库、题库和设置。
- 旧会话仅保留只读入口；旧写状态机已删除。

## 4. 当前运行环境的重要事实

- 根目录 `.env` 已在本机设置 `AGENT_INTERVIEW_ENABLED=1`。
- 本机已由 `scripts/ensure-local-postgres.ps1` 安装项目内便携 PostgreSQL 17.10，运行时和数据位于被忽略的 `.runtime/`。
- 根目录 `.env` 已写入仅监听 `127.0.0.1:55432` 的 `DATABASE_URL`，并设置 `AGENT_ALLOW_MEMORY_CHECKPOINTER=0`。
- `npm run infra:local` 会幂等启动数据库、创建 `ezmock_agent` 数据库并执行 LangGraph checkpoint setup；`npm run dev:all` 和 `AI面试官助手.ps1` 均会先执行该步骤。
- production 环境仍必须提供 `DATABASE_URL`，不能因为开发便利放宽。
- 本地真实 PostgresSaver 重启恢复已通过集成测试和浏览器 E2E；MemorySaver 仅保留为显式应急开发选项。
- API 最近在 3001 端口以 `npm run api:dev` 启动，接手时先重新检查，不要假定进程仍在。

## 5. 当前最关键的产品问题

1. 用户主流程暴露了 Agent、LangGraph、Canonical、事件号、研究状态、模型供应商等技术概念。
2. 创建前没有 readiness 预检，依赖问题只能在提交后发现。
3. 活动会话不能真正 finish，暂停、放弃、删除等生命周期不完整。
4. 首页按技术入口分组，而不是按快速模拟、JD、简历和弱项复练等用户目标分组。
5. 创建表单一次暴露太多选项，没有预计时长、推荐方案和高级设置折叠。
6. 面试过程中展示实时评分和证据，破坏沉浸感。
7. 文本回答是单行输入框，不适合 STAR 多段回答，也没有草稿恢复。
8. 语音没有开始前的设备和权限校准，也没有完整文本降级体验。
9. 报告只有总分和简短汇总，没有逐题改法、行动计划和弱项复练闭环。
10. 设置页把 API Key 和模型选择作为普通用户必备知识，没有服务连通性测试。

## 6. PX-A01 已完成：Agent readiness

PX-A01 已在本地完成并通过类型检查、单元测试及前后端生产构建：

- 后端新增独立 `agent-readiness` 五文件模块与鉴权只读接口 `GET /api/agent/readiness`。
- 检查 Agent 开关、持久/临时 checkpoint、显式 checkpoint 初始化、Agent 迁移版本、用户模型 Key、语音能力和 Tavily 降级。
- 新增无副作用 `check_agent_readiness()` 迁移版本 RPC；未部署该增量迁移的既有环境会只读检查 PostgREST OpenAPI 中的关键 Canonical Agent RPC，不会因探测函数缺失误判主链路不可用。
- production 缺少 `DATABASE_URL` 始终 blocked；仅非 production 且显式开启时允许 MemorySaver，并返回 degraded。
- 前端新增独立 `agent-readiness` feature；创建页在检查完成且非 blocked 前不会发送创建请求。
- 缺 Key、语音不可用、Tavily 缺失、临时 checkpoint 和检查失败均提供设置、文本降级、关闭研究、重试或联系管理员动作。
- 创建失败继续保留受控表单 state；动态状态使用 `aria-live`，错误使用 `role="alert"`。
- readiness 响应和日志只包含稳定状态码及脱敏文案，不返回数据库错误、堆栈、Key、token、简历或回答正文。
- 真实启动前端与 API 后发现未登录保护路由在客户端重定向时产生 hydration mismatch；认证布局现改为先渲染稳定检查壳，再于 hydration 后读取浏览器会话并跳转，未登录 `/new → /auth` 已无新增 hydration 错误。
- 本地 Vite 默认端口 `5173` 已加入 API CORS 白名单；SSE 恢复需要的 `Last-Event-ID` 也已加入允许请求头，服务端会在连接后立即发送空心跳，浏览器已从“轮询恢复”稳定切换为“事件流在线”。
- 模型解析保持用户 BYOK 优先；用户未配置 Key 时可使用服务端对应供应商 Key，Key 只停留在服务端内存，不进入响应、日志或会话持久化。

建议部署时应用 `20260713000001_add_agent_readiness_rpc.sql` 以使用轻量版本探测。当前 Supabase CLI 账号执行远端迁移列表时返回 403 `LegacyDbConfigLoginRoleStatusError`，因此本轮没有强行修改远端 schema；远端 PostgREST OpenAPI 已确认 14 个 Canonical Agent RPC 完整，readiness 会通过只读元数据兼容探测，不影响当前创建主链路。

真实登录态浏览器验收已完成：首次验收曾观察到 MemorySaver 与 Tavily 的 degraded 提示，并验证关闭研究后仍可创建；安装本地 PostgresSaver 且将研究改为显式 opt-in 后，`/new` 现直接显示“可以开始面试 / 本场面试支持服务重启后恢复”。已成功创建语音会话 `9420954a-7d3b-42ae-b961-b88c1ebcee0c` 和多个文本会话，回答提交、评分、推进、刷新恢复与 SSE 均正常。

## 6.1 下一项任务：PX-A03

PX-A03 的创建错误恢复协议已完成首轮实现：共享 HTTP 客户端保留后端稳定 `code`、`retryable` 和状态码，创建页使用独立 `agent-create-recovery` feature 将其映射为原地重试、重新检查、设置或管理员动作。失败时不清空受控表单，并通过 `role="alert"` 明确说明草稿已保留；错误映射与草稿保留已有 3 项前端单元测试，真实成功创建链路也已通过浏览器验收。

### PX-A01 原始目标（已完成）

实现 Agent readiness 模块，让用户在填写和提交创建表单之前知道系统能否开始，以及如何恢复。

### 后端结构

遵守根目录 `AGENTS.md`，新建独立模块：

```text
api-server/src/modules/agent-readiness/
├── agent-readiness.routes.ts
├── agent-readiness.service.ts
├── agent-readiness.repository.ts
├── agent-readiness.schemas.ts
└── agent-readiness.types.ts
```

在 `api-server/src/app.ts` 注册路由。不要把 readiness 逻辑塞进 `interview-agent.routes.ts`。

建议接口：

```text
GET /api/agent/readiness?interviewMode=text&modelProvider=deepseek
```

建议响应：

```typescript
type AgentReadinessResponse = {
  status: "ready" | "degraded" | "blocked";
  checkpointMode: "durable" | "ephemeral" | "unavailable";
  capabilities: {
    text: ReadinessCapability;
    voice: ReadinessCapability;
    webResearch: ReadinessCapability;
  };
  blockers: Array<{
    code: string;
    message: string;
    recoveryAction: "open_settings" | "retry" | "use_text" | "disable_research" | "contact_admin";
  }>;
};
```

### 检查范围

- `AGENT_INTERVIEW_ENABLED`
- `DATABASE_URL` 或显式本地 MemorySaver 模式
- checkpoint schema 是否可用；请求路径禁止隐式 DDL
- Agent RPC/迁移版本是否存在
- 默认或所选模型是否有可用 Key
- voice 模式的 ASR/TTS 配置
- Tavily 缺失只能降级，不应阻断文本面试

### 前端结构

```text
src/features/agent-readiness/
├── api.ts
├── types.ts
├── hooks/use-agent-readiness.ts
└── components/agent-readiness-status.tsx
```

创建页只消费这个 feature，不自己拼装环境判断。

### 验收测试

- Agent 开关关闭：blocked，提供管理员动作，不提交创建请求。
- 模型 Key 缺失：blocked，直接跳转设置。
- Tavily 缺失：degraded，允许关闭研究继续。
- 语音缺失：voice blocked，但允许切换 text。
- 本地 MemorySaver：degraded，明确“服务重启后无法恢复”。
- production 无 `DATABASE_URL`：blocked，绝不启用 MemorySaver。
- 响应中不能包含 URL 密码、API Key、token、原始数据库错误或内部堆栈。

## 7. PX-A01 完成后的顺序

1. `PX-A03` 创建错误与恢复协议。
2. `PX-A02` 暂停、提前结束、放弃和删除。
3. `PX-B01` 目标驱动首页。
4. `PX-B02` 两步创建向导。
5. `PX-C01` 专注面试工作台。
6. `PX-C02` 多行回答和草稿恢复。
7. `PX-D01` 扩展报告业务模型。
8. `PX-D02` 独立报告页。
9. `PX-D03` 弱项复练。

不要跳过 P0 直接做视觉换肤。

## 8. 关键代码入口

### 创建与工作台

- `src/features/interview-agent/components/interview-agent-setup.tsx`
- `src/features/interview-agent/components/interview-agent-page.tsx`
- `src/features/interview-agent/hooks/use-agent-session.ts`
- `src/features/interview-agent/hooks/use-agent-voice.ts`
- `src/features/interview-agent/api.ts`

### Agent 后端

- `api-server/src/modules/interview-agent/interview-agent.routes.ts`
- `api-server/src/modules/interview-agent/interview-agent.service.ts`
- `api-server/src/modules/interview-agent/graph/interview-agent.graph.ts`
- `api-server/src/modules/interview-agent/graph/checkpointer.ts`
- `api-server/src/modules/interview-agent/workspace/`

### 报告与评分

- `api-server/src/modules/interview-agent/evaluation/`
- `api-server/src/modules/interview-agent/report/`
- `api-server/src/modules/interview-agent/audit/`

### 其他产品入口

- `src/features/interview-hub/components/interview-hub-page.tsx`
- `src/features/interview-history/`
- `src/features/resume-library/`
- `src/features/question-bank/`
- `src/features/settings/`

## 9. 已知实现债务

- 多个 Agent 文件头和注释仍写着“Phase 1”，与当前 Phase 1–7 状态不符。
- `finishSession()` 对活动会话仍返回 `agent_finish_not_available`。
- 工作台直接显示 `eventCursor`、研究状态和原始维度键。
- 创建页硬编码默认 DeepSeek，没有先读取用户默认设置和可用性。
- 设置页的模型展示名称可能与后端实际默认模型不一致，应由后端能力接口统一返回。
- 首页卡片使用三列网格但当前只有两个入口，信息架构需要重做。
- “再来一次”没有复制上一场配置。
- 报告尚未独立成页面，也没有长期趋势模型。
- 前端生产构建存在入口 chunk 大于 500kB 的警告，后续新增报告图表时应做路由级拆分。

## 10. 开发和验证命令

```powershell
# 前端
npm run dev
npx tsc --noEmit
npm run build

# 后端
cd api-server
npm run dev
npx tsc --noEmit
npm test
npm run build
```

当前最近一次完整验证（2026-07-13）：

- 前端：3 项恢复协议测试全部通过，`npx tsc --noEmit` 通过，Vite 客户端与 SSR 生产构建通过。
- 后端：108 项测试全部通过、0 失败、0 跳过，其中包括真实 PostgresSaver 跨实例恢复；`npx tsc --noEmit` 与 API 生产构建通过。
- 浏览器：readiness 降级动作、真实文本/语音创建、文本首题提交评分、刷新恢复和鉴权 SSE 在线均通过。
- 持久恢复：新建会话 `f9342c7e-5f01-4ef8-ad4c-09928343c281` 后提交首轮回答，完整停止并重启 API，再提交追问成功，事件游标从 8 推进到 12；PostgresSaver 集成测试不再跳过。
- 唯一构建提示仍是前端入口 chunk 约 608 kB，属于已记录的拆包债务。

readiness 模块至少需要：service 单元测试、repository 契约测试、路由鉴权/脱敏测试和前端状态映射测试。

## 13. 2026-07-13 产品闭环实施更新

本节覆盖第 5、7、9、10 节中已经过时的待办描述。完整实现细节和风险见 `docs/PRODUCT_EXPERIENCE_IMPLEMENTATION_HANDOFF.md`。

### 已完成

- 联网研究不再依赖唯一 Tavily Key：Tavily 优先，无 Key 时使用 Wikimedia Core REST API 的真实公开检索；最近一次真实创建持久化了 5 个可追溯来源。
- PX-A01 readiness 已在远端部署 `check_agent_readiness()`，公开研究 Provider 可用时不再因 Tavily 缺失降级。
- PX-A02 生命周期已新增独立后端模块和远端 RPC：暂停、恢复、提前结束阶段性报告、放弃、整场删除与 checkpoint 清理均已真实通过。
- PX-B01 首页已按快速模拟、JD、简历、弱项复练四种用户目标重组。
- PX-B02/PX-B03 创建页已改为两步向导和方案预览，创建草稿自动保存。
- PX-C01/PX-C02 活动工作台已隐藏技术状态、研究和实时评分，支持多行回答、草稿恢复和 `Ctrl/Cmd + Enter`。
- PX-C03 继续由 readiness 在开始前检查 ASR/TTS，缺失时可切换文本；设备权限仍需人工走查。
- PX-D01/PX-D02/PX-D03 已有扩展报告投影、独立报告深链接和最低分维度复练草稿。
- 历史与首页能区分进行中、暂停、完成和放弃状态，完成会话直接进入报告。

### 最新验证

- 后端：113 项测试通过；TypeScript 与生产构建通过。
- 前端：3 项恢复测试通过；TypeScript、客户端构建和 SSR 构建通过。
- 真实闭环：readiness ready；联网来源 5 个；暂停/恢复、阶段性报告和删除全部成功。

### 数据库操作说明

用户已明确授权远端数据库改动。本轮通过 linked Management API 精确执行 `20260713000001` 和 `20260713000002`，没有执行数据库重置。远端迁移历史为空，不能直接全量 `db push`；先按新交接文档建立基线。

### 下一步

当前主链路已经可运行。优先补浏览器 375px/真实麦克风人工验收、迁移历史基线、通用全网搜索 Provider 和跨多场弱项趋势；不要再恢复旧面试写状态机。

## 11. 不可破坏的边界

- 新功能必须是独立模块/feature，遵守四层后端结构和薄路由约定。
- 后端统一使用 `consola` 的模块 logger，禁止新增裸 `console.*`。
- 每个新增文件必须有文件头；函数、接口字段、数据库查询和 prompt 策略按 `AGENTS.md` 注释。
- 回答正文、简历原文、API Key 和 token 不得进入 checkpoint、日志、埋点或错误响应。
- 重试必须幂等，不能重复插入消息、证据、评分或报告。
- 旧会话保持只读，禁止恢复旧写状态机作为 fallback。
- 生产环境必须使用 PostgreSQL `PostgresSaver`。
- 不要执行 `git push`、Supabase 生产迁移、Railway/Vercel 部署，除非用户明确授权。

## 12. 每次交付的检查清单

- [ ] 产品文案没有泄漏不必要的 Agent 内部概念。
- [ ] 用户遇到失败时有明确原因和下一步动作。
- [ ] 创建失败不丢表单或草稿。
- [ ] 关键路径可使用键盘完成。
- [ ] 动态状态使用 `aria-live`，错误使用 `role="alert"`。
- [ ] 触控目标至少 44×44px。
- [ ] 375px 无横向滚动。
- [ ] TypeScript、相关测试和生产构建通过。
- [ ] 未触碰用户周报或无关改动。
- [ ] 未推送、部署或修改生产数据库。
