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
- 不要推送、部署或执行生产数据库迁移，除非用户再次明确授权。
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
- 本机没有 PostgreSQL，也没有可用于构造 Supabase 直连串的数据库密码。
- 根目录 `.env` 已显式设置 `AGENT_ALLOW_MEMORY_CHECKPOINTER=1`，只用于本地开发。
- `createAgentRuntimeCheckpointer()` 在非 production 且显式开关为 1 时使用 MemorySaver。
- production 环境仍必须提供 `DATABASE_URL`，不能因为开发便利放宽。
- MemorySaver 下 API 重启后进行中 checkpoint 不可恢复；业务投影可能仍存在。
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

建议部署时应用 `20260713000001_add_agent_readiness_rpc.sql` 以使用轻量版本探测；应用前仍可通过只读 RPC 元数据兼容检查，不执行数据库写入或 DDL。

真实登录态的创建页、设置跳转和实际创建仍需在测试账号登录后完成浏览器验收；不要把未登录跳转与静态构建通过误写为完整 E2E 通过。

## 6.1 下一项任务：PX-A03

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

当前最近一次后端验证：89 项测试中 88 通过、0 失败、1 项因未配置 `AGENT_TEST_DATABASE_URL` 跳过。

readiness 模块至少需要：service 单元测试、repository 契约测试、路由鉴权/脱敏测试和前端状态映射测试。

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
