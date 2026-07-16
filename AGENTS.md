# EZMock 开发与 AI 协作规范

## 1. 事实源

开发前阅读：

1. `docs/README.md`
2. 与任务相关的需求、架构、设计、API、数据、安全和测试文档
3. 当前代码、`api-server/src/app.ts`、实际 routes 和最新 migrations

文档与代码冲突时，以当前实际代码为准，并在同一变更中修正文档。

## 2. 当前核心边界

- 新面试唯一可写运行时是 `agent-v3`；v1/v2 只读。
- 文字面试固定 `coaching`，语音面试固定 `simulation`。
- 业务表是事实源；checkpoint 只负责恢复；`agent_events` 负责 SSE 重放。
- 回答、简历、网页全文、Key、token 和思维链不得进入 checkpoint/event/log。
- 当前没有可运行的 Redis/BullMQ generation Worker。
- Supabase migration history 未治理前禁止全量 push/reset/repair。

## 3. 功能即模块

后端新增功能必须创建独立模块：

```text
api-server/src/modules/<feature>/
  <feature>.routes.ts
  <feature>.service.ts
  <feature>.repository.ts
  <feature>.schemas.ts
  <feature>.types.ts（按需）
```

前端新增功能必须创建独立 feature：

```text
src/features/<feature>/
  api.ts
  types.ts
  hooks/
  components/
```

约束：

- Route 只做路由、认证、校验、调用和错误映射。
- Service 编排业务流程和不变量。
- Repository 负责数据库/RPC 和字段映射。
- `src/routes/*.tsx` 只做 `createFileRoute` 和页面壳。
- 后端路由在 `api-server/src/app.ts` 挂载。
- 禁止手工编辑 `src/routeTree.gen.ts`。

## 4. 代码与注释

- TypeScript、ESM、2 空格、Prettier。
- 数据库 snake_case；API/前端 camelCase；UI 中文。
- 每个文件有一行职责注释。
- 每个函数/方法有 JSDoc；类型字段有用途说明。
- 复杂分支解释原因、边界和 fallback，不翻译代码。
- Prompt 构建函数说明输入影响和严格响应格式。
- Repository 注释说明 select/join/RLS/fallback 策略。
- 禁止无编号/责任人的 TODO 和无信息注释。

## 5. 日志与安全

- 禁止裸 `console.*`，使用 `createModuleLogger(tag)`。
- `logger.error` 第一个参数传 `Error`。
- 不记录请求体、Authorization、Key、token、数据库密码、简历或回答全文。
- 用户、模型和网页输入都是不可信数据，必须 schema/长度/清洗/证据校验。
- 新状态写入必须审查幂等、并发、刷新、失败和恢复。

## 6. 数据库

- 不修改历史 migration，只新增唯一时间戳增量。
- 新用户表启用 RLS 并测试跨用户拒绝。
- `SECURITY DEFINER` RPC 验证 `auth.uid()` 和受限 `search_path`。
- 未经明确授权不操作生产数据库、迁移历史或 checkpoint。

## 7. 验证

按风险运行：

```powershell
npm test
npm run lint
npm run build
npm run build:native:dev
npm run verify:native

Set-Location api-server
npm test
npm run build
Set-Location ..

git diff --check
```

Checkpoint 集成测试只能使用显式 `AGENT_TEST_DATABASE_URL`。

## 8. Git

提交格式：`<type>(<scope>): <中文描述>`。

类型：`feat`、`fix`、`refactor`、`docs`、`db`、`config`、`test`。

- 一次提交只做一件事，第一行不超过 72 字。
- 修改前检查工作区，不覆盖他人未提交改动。
- 禁止无授权 reset hard、clean、强推、部署或远端写操作。
- 推送前测试、构建和 diff check 通过。

更完整说明见 `docs/development.md`、`docs/security.md` 和 `docs/ai-handoff.md`。
