# AI 与新成员接手指南

> 状态：当前；最后核验：2026-07-16；基线：`main@8f90b63`

## 1. 一句话上下文

EZMock 是使用 TanStack Start + Hono + Supabase + LangGraph 构建的 AI 面试平台。新面试唯一运行时为 `agent-v3`；文字固定 coaching，语音固定 simulation；业务表是事实源，checkpoint 负责恢复，`agent_events` 负责 SSE 重放。

## 2. 接手前必须知道

1. 完整阅读根目录 `AGENTS.md` 和 `docs/README.md`。
2. 以当前代码、`api-server/src/app.ts`、实际 routes 和最新 migrations 为准。
3. v1/v2 只读，不得恢复旧写链路。
4. 回答正文、简历原文、网页全文、Key 和 token 不得进入 checkpoint/event/log。
5. 远端 Supabase migration history 未治理，禁止直接 push/reset/repair。
6. 当前没有可运行的 BullMQ/Redis generation Worker。
7. OpenAPI 仍可能包含未挂载旧接口，需与 route 事实核对。

## 3. 工作区保护

接手时先执行：

```powershell
git status --short --branch
git log -1 --oneline --decorate
git diff --stat
```

当前工作区在文档整理前已有用户未提交改动，包括 SSR logger、AI 使用日志、验收材料和周报。不得执行：

```text
git reset --hard
git clean -fd
git checkout -- <user-file>
git push --force
```

不要把本轮文档变更与用户原有业务改动混成一个提交，除非用户明确要求。

## 4. 推荐阅读顺序

1. `README.md`
2. `docs/project-overview.md`
3. `docs/requirements.md`
4. `docs/architecture.md`
5. `docs/detailed-design.md`
6. 与任务有关的 API/DATA/SECURITY/TESTING 文档
7. 具体模块代码与测试

## 5. 关键代码入口

| 主题           | 入口                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| Hono 路由装配  | `api-server/src/app.ts`                                                 |
| Agent Graph    | `api-server/src/modules/interview-agent/graph/interview-agent.graph.ts` |
| Agent 会话编排 | `interview-agent/interview-agent.service.ts`                            |
| Planner/工具   | `agent-orchestration/`、`interview-agent/tools/`                        |
| 输入/评分/报告 | `interview-agent/input/`、`evaluation/`、`report/`                      |
| SSE/workspace  | `interview-agent/events/`、`workspace/`                                 |
| 语音           | `voice/`、`interview-agent/voice-bridge/`                               |
| 知识库         | `api-server/src/modules/knowledge/`                                     |
| 前端面试       | `src/features/interview-agent/`、`immersive-voice-interview/`           |
| 跨端           | `src/shared/runtime/`、`src/shared/platform/`、`src-tauri/`             |

## 6. 建议第一轮验证

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

2026-07-16 基线：根项目 16 项通过；API 143 项通过、1 项隔离 PostgreSQL 测试跳过；全部构建通过；lint 0 error/3 warning。

## 7. 当前优先风险

- Supabase migration baseline。
- OpenAPI 与实际路由漂移。
- Tauri dev 端口/CSP/域名统一和真实设备验收。
- 无效 Railway Worker 配置。
- 语音一次性 token 的多副本问题。
- 主入口约 624 kB。

## 8. 外部操作边界

以下操作需要用户明确授权：

- Git push、强推、PR、合并或删除远端分支。
- 生产数据库写入、迁移、repair、reset 或数据删除。
- Vercel/Railway/Supabase 部署、环境变量、域名或资源变更。
- 删除 checkpoint、用户、会话或远端资源。

## 9. 可复制启动提示

```text
你将接手 C:\Users\cys\ezmock。请先完整阅读 AGENTS.md、docs/README.md 和 docs/ai-handoff.md，只做只读检查并保护现有未提交改动。以 api-server/src/app.ts、实际 *.routes.ts、当前代码和最新 migrations 为事实源。新会话只允许 agent-v3；不得恢复 v1/v2，不得把敏感正文或凭据写入 checkpoint/event/log。未经明确授权不要 push、部署或修改远端数据库。先运行根项目和 api-server 的测试/构建，再汇报基线和阻塞。
```
