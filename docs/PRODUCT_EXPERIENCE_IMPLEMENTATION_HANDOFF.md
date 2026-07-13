# EZMock 产品体验与业务闭环实施交接

> 更新时间：2026-07-13。本文记录本轮实际落地、验证证据、远端状态和后续风险，优先级高于旧交接文档中已经过时的“待实现”描述。

## 1. 本轮结果

本轮已把“创建前不知道能否运行、Tavily 缺失就没有联网、活动会话无法退出、面试中暴露技术信息、报告无独立页面”这条断裂链路收口为可运行产品：

1. 联网研究使用双层 Provider：有 `TAVILY_API_KEY` 时使用 Tavily；没有 Key 时使用 Wikimedia Core REST API 的公开知识检索。
2. readiness 会识别 Tavily 或公开检索能力。只有两者都被禁用时，所选联网研究才 degraded；普通文本面试不会被阻断。
3. 会话支持暂停、恢复、提前结束并生成阶段性报告、放弃和整场删除。
4. 创建首页按“快速模拟、JD、简历、弱项复练”组织，两步向导先确认目标，再预览执行方案和 readiness。
5. 面试工作台在活动期间隐藏研究来源、事件游标、实时证据与分数；文本回答改为多行、自动保存、`Ctrl/Cmd + Enter` 提交。
6. 报告有独立深链接页面，展示总评、能力维度、逐题反馈和回答证据，并可把最低分维度写入下一场训练草稿。
7. 远端 Supabase 已应用 readiness 与 lifecycle RPC；本地 Agent checkpoint 使用 PostgreSQL PostgresSaver，不使用隐式 MemorySaver。

## 2. 联网功能为什么原来不能用

原实现把 Tavily 作为唯一 Provider。根目录 `.env` 的 `TAVILY_API_KEY` 为空时，工厂直接返回 Disabled Provider，因此 `AGENT_WEB_RESEARCH_ENABLED=1` 也只能表示“允许尝试”，不代表存在实际搜索后端。

当前解析顺序：

```text
Tavily Key 存在
  -> TavilySearchProvider
否则 AGENT_PUBLIC_WEB_RESEARCH_ENABLED != 0
  -> PublicKnowledgeWebSearchProvider (Wikimedia)
否则
  -> DisabledWebSearchProvider
```

公开 Provider 只访问固定 `api.wikimedia.org` 主机，限制重定向、超时、结果数量和正文长度；返回给 Agent 前仍执行 HTML 清理、URL 校验、去重、哈希和“不可信外部资料”边界包装。来源链接指向可追溯的 Wikipedia 页面。

## 3. 新增模块和接口

### 后端生命周期模块

```text
api-server/src/modules/interview-lifecycle/
├── interview-lifecycle.routes.ts
├── interview-lifecycle.service.ts
├── interview-lifecycle.repository.ts
├── interview-lifecycle.schemas.ts
├── interview-lifecycle.types.ts
└── interview-lifecycle.service.test.ts
```

接口：

- `POST /api/agent/sessions/:sessionId/lifecycle`
  - 请求：`{ action: "pause" | "resume" | "finish" | "abandon" }`
- `DELETE /api/agent/sessions/:sessionId`
- `GET /api/agent/sessions/:sessionId/workspace` 新增 `productStatus`

数据库函数：

- `manage_agent_session_lifecycle(UUID, TEXT)`：锁行、校验 `auth.uid()` 与 Agent 版本、更新状态；提前结束时仅聚合冻结的 `question_evaluations`，不读取回答正文。
- `delete_agent_session(UUID)`：校验所有权后删除会话，依靠外键级联清理业务投影，API 再清理独立 PostgreSQL checkpoint。

活动会话提交回答前会检查 `productStatus === "in_progress"`。暂停、放弃、完成后的直接 API 写入都会被拒绝，没有恢复旧面试写状态机。

### 前端独立 feature

```text
src/features/interview-lifecycle/
├── api.ts
├── types.ts
├── hooks/use-interview-lifecycle.ts
└── components/interview-lifecycle-actions.tsx

src/features/interview-report/
├── api.ts
├── types.ts
├── hooks/use-interview-report.ts
└── components/interview-report-page.tsx
```

新增路由：`/_authenticated/report/$id`，对应用户 URL `/report/:id`。

## 4. 数据库和远端状态

新增迁移：

- `20260713000002_add_interview_lifecycle.sql`

本轮通过 Supabase CLI 的 linked Management API 实际执行：

- `20260713000001_add_agent_readiness_rpc.sql`
- `20260713000002_add_interview_lifecycle.sql`

执行后已查询确认远端存在：

- `check_agent_readiness`
- `manage_agent_session_lifecycle`
- `delete_agent_session`

注意：该项目远端 `supabase_migrations.schema_migrations` 在执行前没有历史记录，而仓库存在多组相同时间戳的旧迁移。为了避免 `db push` 重放并破坏现有 schema，本轮使用 `db query --linked --file` 精确应用两个增量文件，没有伪造历史记录。后续接手者应先做迁移历史基线治理，不能直接执行全量 `supabase db push`。

## 5. 验证证据

### 自动化

- 后端 `npm test`：113 项通过（顶层脚本包含 4 voice + 3 config + 3 model provider + 8 readiness + 95 Agent/lifecycle）。
- 前端 `npm test`：3 项创建恢复测试通过。
- 后端 `npx tsc --noEmit`：通过。
- 前端 `npx tsc --noEmit`：通过。
- 后端 `npm run build`：通过。
- 前端 `npm run build`：客户端和 SSR 生产构建通过。

### 真实远端业务闭环

脚本：`scripts/verify-agent-product-e2e.mjs`

脚本创建一次性已确认用户，使用真实用户 JWT 调用本地 API 和远端 Supabase，最后删除用户并级联清理测试数据。最近一次结果：

```json
{
  "readiness": "ready",
  "researchStatus": "completed",
  "researchSourceCount": 5,
  "pauseResume": true,
  "partialReport": true,
  "deleted": true
}
```

该结果证明：无 Tavily Key 时仍进行了真实网络检索；创建、准备、来源持久化、暂停、恢复、阶段性报告、业务删除和 checkpoint 清理可以共同运行。

## 6. 安全与可恢复性

- API 响应、模块日志和 E2E 输出均不包含 API Key、token、数据库密码、简历原文、用户回答正文或原始数据库异常。
- lifecycle Repository 丢弃数据库原始错误，只返回稳定模块错误。
- 页面错误使用 `role="alert"`，readiness 和草稿状态使用 `aria-live`。
- 创建草稿存储键：`ezmock:create-wizard-draft:v1`。
- 回答草稿按会话存储键：`ezmock:answer-draft:<sessionId>`。
- 创建成功或回答成功后才清理相应草稿；请求失败、刷新和暂停不会丢输入。
- production 缺少 `DATABASE_URL` 仍然 blocked，绝不自动使用 MemorySaver。

## 7. 已知风险和后续建议

1. 无 Key 降级是公开知识检索，不等价于全网搜索。需要招聘官网、最新新闻和小众公司资料时仍建议配置 Tavily 或增加第二个通用搜索 Provider。
2. 业务数据库与 checkpoint 数据库不是同一事务。终态 RPC 成功但 checkpoint 删除失败时，服务会写脱敏告警；业务层已不可继续提交，但需要管理员清理孤立 checkpoint。
3. Supabase 迁移历史尚未建立基线，见第 4 节。完成基线前不要全量 `db push`。
4. 语音 readiness 已检查 ASR/TTS 配置并支持切换文本；本轮没有在自动化浏览器中授予真实麦克风权限，设备级权限仍需人工走查。
5. 弱项复练当前通过报告的最低平均维度生成下一场可编辑草稿，尚未实现跨多场的长期弱项趋势模型。
6. 前端构建仍提示入口 chunk 约 609 kB，生产可运行，但应继续做路由级拆包和图表懒加载。
7. Codex in-app Browser 在最终验收阶段没有暴露可控制 tab；因此最终 UI 以 TypeScript、SSR/客户端构建和真实 API E2E 为证据，375px 与真实视觉回归建议补一次人工检查。

## 8. 推荐接手顺序

1. 在已登录浏览器走查 `/interview-hub`、`/new`、`/session/:id`、`/report/:id` 的 375px 和桌面布局。
2. 为 lifecycle route/repository 增加直接 HTTP 与 RPC 契约测试；当前 service 和真实 E2E 已覆盖主路径。
3. 建立远端 migration history 基线，再恢复标准 `supabase db push` 流程。
4. 增加通用搜索 Provider，并在来源卡片标注 Provider、发布时间与抓取时间。
5. 将弱项复练扩展为跨场趋势、行动计划和复练前后对比。
