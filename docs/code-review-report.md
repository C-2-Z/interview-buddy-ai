# EZMock 代码评审报告（合并前独立评审）

- **评审对象**：`apps/api/src`、`apps/web/src` 的 keeper 代码（npm-workspaces 合并后的保留代码）
- **对照基准**：`AGENTS.md`、`docs/系统架构设计.md`、`docs/安全与隐私设计.md`、`docs/需求规格说明书.md`
- **评审方式**：独立评审，仅评价工作产物，不修改代码
- **评审日期**：2026-07-17

## 概述

整体代码质量显著高于一般合并期项目：架构严格遵循 AGENTS.md 的「功能即模块」四层拆分（routes/service/repository/schemas），安全边界在数据层有**硬约束**（DB CHECK 拒绝敏感键、RLS 全覆盖、SECURITY DEFINER RPC 校验 `auth.uid()`），事件与 checkpoint 严格排除回答/简历/思维链。未发现裸 `console.*`、未发现跨用户数据泄露路径、未发现阻断构建的明显错误。

主要风险集中在四点：(1) 6 个 Repository 用 `@ts-nocheck` 关闭了类型检查，掩盖了 Supabase 类型未生成带来的类型盲区；(2) 语音短令牌存于进程内存 Map，多实例部署下会整体失效；(3) 三个模块重复挂载在 `/api/agent` 且共享 `:sessionId` 子资源，可读性/可维护性偏弱；(4) 前端存在个别低信息注释与一处裸 `console.error`。

## 严重问题（Critical）

| 编号 | 维度 | 文件 | 描述 |
| --- | --- | --- | --- |
| C-1 | 安全/可恢复性 | 无 | 未发现 Critical 级阻断问题。安全检查（敏感键 CHECK、`_agent_json_has_sensitive_key`、RLS、`SECURITY DEFINER` + `auth.uid()` + `search_path`、AES-256-GCM 加密、严格 `strict()` 事件 schema）均已落实，数据最小化规则在代码与数据库双重层面强制。 |

> 结论：当前保留代码**没有必须立即阻断合并的 Critical 缺陷**。下列 Important 项建议在合并前处理或显式记录风险接受。

## 重要问题（Important）

| 编号 | 维度 | 文件 | 描述与建议 |
| --- | --- | --- | --- |
| I-1 | 代码质量/类型安全 | `agent-memory/agent-memory.repository.ts:1`、`agent-orchestration/agent-orchestration.repository.ts:1`、`knowledge/knowledge.repository.ts:1`、`knowledge/graph.repository.ts:1`、`knowledge/brain/brain.repository.ts:1`（及对应 `dist/` 产物） | 共 5 个源码文件（另含编译产物）顶部使用 `// @ts-nocheck`，原因是「新表/RPC 尚未纳入 `supabase-types.ts`」。这会**关闭整文件的类型检查**，真实类型错误（字段名拼写、返回值结构、RPC 入参）无法在构建期捕获。根因是 `lib/supabase-types.ts` 未重新生成。建议：合并前执行 `supabase gen types` 并移除 `@ts-nocheck`，或至少补齐 `Database` 类型中新增表/RPC，恢复类型保护。 |
| I-2 | 架构/可扩展性 | `voice/voice-token.service.ts:6-77` | `issuedTokens` 为进程内 `Map`，且 `verifyVoiceSocketToken` 在验证后 `delete(id)`（一次性消费）。在多个 API 实例（负载均衡/弹性伸缩）部署时，由实例 A 签发的 WS 令牌可能落到实例 B，`verify` 查不到该 id 直接返回 `null` → 语音连接整体 401。当前单实例可运行，但违背 AGENTS.md「生产必须 HTTPS/WSS、可分离部署」的部署拓扑。建议：改用签名无状态令牌（HMAC 负载自带 `sessionId/userId/exp`，不依赖服务端内存），与现有 HMAC 签名机制一致。 |
| I-3 | 架构/可维护性 | `app.ts:39-43` | `agent-readiness`、`interview-lifecycle`、`agent-orchestration`、`interview-agent` 四个模块全部挂载在 `/api/agent` 前缀，且都操作 `:sessionId` 子资源（如 `interview-agent.routes.ts:101` 的 `GET /sessions/:sessionId` 与 `agent-orchestration.routes.ts:20` 的 `GET /sessions/:sessionId/activities`，以及 lifecycle 的 `/lifecycle`、`/delete`）。同一会话的创建/获取/输入、活动、生命周期、删除被拆到不同模块，路由聚合点分散、易在后续迭代中造成路径冲突或重复校验。建议：在 `AGENTS.md` 或模块 README 中明确各模块对 `/sessions/:sessionId/*` 的**路径归属契约**，避免后续新增端点时重叠。 |
| I-4 | 安全/纵深防御验证 | `supabase/migrations/*` | RLS、`SECURITY DEFINER` + `auth.uid()`、CHECK 约束均已就位（如 `20260711000002` 启用 `agent_events`/`agent_operations` RLS、`_agent_json_has_sensitive_key` CHECK）。但 AGENTS.md 要求「新用户表启用 RLS 并**测试跨用户拒绝**」。当前未见跨用户拒绝的集成测试与 Repository 调用是否始终携带 `user_id` 的对应关系确认（部分 Repository 仅依赖用户作用域 client 的 RLS 兜底，未显式传 `userId` 入参）。建议：补充跨用户越权访问的集成测试（尤其 `agent_events`、`agent_training_profiles`、`knowledge_*`、`resumes`），把 RLS 作为显式验收项。 |

## 次要问题（Minor）

| 编号 | 维度 | 文件 | 描述 |
| --- | --- | --- | --- |
| M-1 | 代码质量 | `apps/web/src/features/tauri-deep-link/api.ts:15` | 一处裸 `console.error("[tauri-deep-link] ...")`。AGENTS.md 第 5 节禁止裸 `console.*`。建议改为项目共享 logger（前端若已有错误上报则接入 `lib/error-capture.ts`）。 |
| M-2 | 代码质量/注释 | `apps/web/src/routes/index.tsx`（Landing 组件上方 `** landing */`） | 存在无信息注释 `** landing */`，违反 AGENTS.md「禁止无信息注释」「每个函数有 JSDoc」。属低价值注释，建议删除或改为说明组件职责的 JSDoc。 |
| M-3 | 架构 | `app.ts:39` 与 `:40-43` 顺序 | `app.route("/api/agent/readiness", ...)` 在 `/api/agent` 之前注册。Hono 按注册顺序匹配，功能上无冲突，但可读性上 readiness 路径与其他 `/api/agent/*` 分离挂载会造成心智负担。建议统一为 `/api/agent/readiness` 作为 `/api/agent` 下的一个子路由或在文档中标注。 |
| M-4 | 完整性 | `apps/api/src/modules/model-providers` | 该模块仅含 `model-provider.service.ts`/`provider.types.ts`，无 `repository`/`schemas`/`routes`，符合其「纯适配层」定位；但需确认解密用户 API Key 的调用路径（应在 `settings` 层解密后**只在本请求内存中短时持有**，不得缓存或写入日志/事件）。当前全局 grep 未见 Key 落日志，但建议在该模块补一条 JSDoc 显式声明 Key 的生命周期边界。 |
| M-5 | 完整性 | `apps/api/dist/` | 仓库中存在 `apps/api/dist/`（编译产物，含 `@ts-nocheck` 残留注释）。应确认 `.gitignore` 已忽略 `dist/`，避免合并时把旧产物带入。 |

## 亮点（Strengths）

- **数据最小化双保险（S-1）**：`supabase/migrations/20260711000002` 定义 `_agent_json_has_sensitive_key` 作为 CHECK 约束，在**数据库层**直接拒绝 `key/token/secret/apikey/...` 等敏感键写入 JSONB 列；同时 `interview-agent.repository.ts` 的事件 schema 全部 `strict()` 且不含回答/简历/思维链字段（如 `ScoreCompletedDataSchema` 仅含分数与 `rationale`/`evidenceIds`）。这是「回答/简历/Key/思维链不得进入 checkpoint/event/log」规则的有力落地。
- **稳健的 SSE 重放（S-2）**：`events/agent-event-stream.ts` 的 `loadAgentEventCatchup` 对非法/超前/缺口/积压超页游标均回退到最新快照重同步，不合成未入库事件；轮询 + 心跳设计避免了慢消费者无限缓存（满足 NFR-03）。
- **安全基线扎实（S-3）**：CORS 拒绝通配符并强制精确 origin（`config/cors.ts:26`）；`SECURITY DEFINER` RPC 均校验 `auth.uid()` 且 `SET search_path`（`20260711000002` 等）；用户 Key 采用 AES-256-GCM（`encryption.service.ts`，IV 随机、带 auth tag）；`logger` 默认递归脱敏 `key/token/secret/...` 键（`voice-logger.ts:13-23`）。
- **幂等与状态一致性意识（S-4）**：`AgentInputSchema` 的 `inputId` 稳定幂等键、`claim` RPC 的并发 claim（`interview-agent.repository.ts:990`），以及对 checkpoint schema 幂等建表的 `setup-checkpoint`（`serve.ts:11-16`），均体现 AGENTS.md 第 5 节「新状态写入必须审查幂等、并发、刷新、失败和恢复」的要求。
- **模块边界清晰（S-5）**：后端 13 个模块均按 routes/service/repository/schemas 拆分；前端 18 个 feature 各自拥有 `api.ts/types.ts/hooks/components`；`routes/*.tsx` 保持薄壳（如 `routes/index.tsx` 仅 `createFileRoute` + 组件）。与 NFR-04 一致。

## 合并前建议

1. **处理 I-1（优先级最高）**：重新生成 `supabase-types.ts`，移除 5 处 `@ts-nocheck`，让类型检查覆盖 Repository 层；合并前务必跑通 `npm run build`（API 与 Web）与 `npm run lint`。
2. **处理 I-2**：将语音 WS 令牌改为无状态 HMAC 签名（不依赖进程内存），以支持多实例部署；至少在当前合并说明中明确「语音仅支持单实例 API」。
3. **补齐 I-4 的验收测试**：补充跨用户拒绝的集成测试，作为合并门禁（对应 AC-10/AC-13、NFR-01）。
4. **清理 Minor**：移除 `tauri-deep-link/api.ts` 的裸 `console.error`、删除 `routes/index.tsx` 无信息注释、确认 `apps/api/dist/` 已被 gitignore。
5. **文档一致性**：在 `AGENTS.md` 或 `系统架构设计.md` 中显式记录 `/api/agent` 下各模块的路径归属契约（I-3），避免后续端点路径冲突。
6. **勿回看 legacy**：`api-server/` 的保留逻辑（若有关键 RPC/校验）应确认已迁移至 `apps/api`；本次评审范围内未发现缺失的关键能力，但建议在合并删除 `api-server/` 前做一次「legacy 端点 vs 新端点」对照清单核验。
