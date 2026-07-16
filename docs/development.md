# 开发指南

> 状态：当前；最后核验：2026-07-16

## 1. 环境要求

- Windows/macOS/Linux；Tauri MSI 构建需要 Windows。
- Node.js 22（`.node-version`、`.nvmrc`）。
- npm。
- Tauri 开发需要 Rust stable、Cargo 和 WebView2。
- 持久 Agent 本地运行需要 PostgreSQL `DATABASE_URL`；仅测试可显式使用 MemorySaver。

## 2. 安装

```powershell
npm install
Set-Location api-server
npm install
Set-Location ..
```

复制 `.env.example` 为 `.env` 并填写本地配置。不得提交真实 `.env`。

## 3. 本地启动

```powershell
# 终端 1
npm run api:dev

# 终端 2
npm run dev
```

API 默认 `localhost:3001`。Web 开发期通过 Vite 把 `/api` 代理到 API。也可使用 `./AI面试官助手.ps1`。

Agent 创建默认关闭。要运行真实面试需配置：

```env
AGENT_INTERVIEW_ENABLED=1
DATABASE_URL=postgresql://...
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DEEPSEEK_API_KEY=...
```

语音与知识库还需要 `AI_BAILIAN_API_KEY` 和真实 Qwen WebSocket 地址。`VOICE_MOCK_QWEN=1` 仅用于本地协议/UI 测试。

## 4. 常用命令

### 根项目

| 命令                       | 用途                              |
| -------------------------- | --------------------------------- |
| `npm run dev`              | Web 开发服务器                    |
| `npm test`                 | 共享基础、恢复和语音体验测试      |
| `npm run lint`             | ESLint                            |
| `npm run build`            | Web client + SSR production build |
| `npm run build:native:dev` | Native SPA development build      |
| `npm run verify:native`    | 检查 Native 入口与服务端秘密边界  |
| `npm run tauri:dev`        | Tauri 开发                        |
| `npm run tauri:build`      | Tauri MSI 构建                    |

### API

| 命令                                      | 用途                              |
| ----------------------------------------- | --------------------------------- |
| `npm run dev`                             | tsx watch                         |
| `npm test`                                | 全部 API 测试                     |
| `npm run test:coverage:acceptance`        | 核心业务覆盖率                    |
| `npm run build`                           | TypeScript build + Skill 资源复制 |
| `npm run agent:checkpoint:setup`          | 显式初始化 checkpoint             |
| `npm run agent:checkpoint:cleanup-legacy` | 旧 checkpoint dry-run 清理        |

清理脚本默认 dry-run；`--execute` 需要用户明确授权。

## 5. 新增后端功能

1. 在 `api-server/src/modules/<feature>/` 创建独立模块。
2. 定义 types 与 Zod schemas。
3. Repository 只访问本模块表/RPC，并说明字段、关联、RLS 和 fallback。
4. Service 编排业务步骤、不变量、幂等和错误。
5. Route 只做认证、解析、调用和稳定错误映射。
6. 在 `api-server/src/app.ts` 挂载。
7. 更新 API、数据、测试和安全文档。

最低结构：

```text
<feature>.routes.ts
<feature>.service.ts
<feature>.repository.ts
<feature>.schemas.ts
<feature>.types.ts（按需）
```

## 6. 新增前端功能

1. 在 `src/features/<feature>/` 创建独立 feature。
2. `api.ts` 统一使用 `src/shared/api/http-client.ts`。
3. `types.ts` 不直接复制数据库 snake_case；转换为前端 camelCase。
4. hooks 管理远端请求、恢复和用户操作。
5. components 处理 loading/empty/error/success 和可访问性。
6. 在 `src/routes/` 新增薄路由。
7. 运行开发服务生成 `src/routeTree.gen.ts`，禁止手改。

## 7. 编码规范

- TypeScript、ESM、2 空格缩进、Prettier。
- 函数 camelCase、类型 PascalCase、文件 kebab-case。
- `@/` 引用 `src/`。
- 数据库 snake_case，API/前端 camelCase，UI 中文。
- 每个文件有一行职责注释；函数/方法有 JSDoc。
- 注释解释职责、原因、边界和 fallback，不翻译代码。
- AI Prompt 构建函数说明输入影响和响应格式。
- 禁止裸 `console.*`；使用 `createModuleLogger(tag)`。

## 8. 数据库开发

- 只创建新的增量迁移，不修改旧迁移。
- 新表默认 RLS，定义 authenticated/service_role 权限。
- RPC 内校验 `auth.uid()` 和输入 JSON 类型/长度/敏感键。
- 新 Agent 数据必须审计能否进入 checkpoint/event/log。
- 当前迁移历史未治理，禁止未经授权的远端 push/reset/repair。

## 9. AI 与外部服务开发

- Provider 通过接口注入，测试使用 deterministic/mock 实现。
- 关键模型输出必须严格 schema，明确 repair/fallback。
- 不暴露思维链；持久化稳定原因码和业务结果。
- 联网只走固定 adapter，清洗后以不可信资料进入 Prompt。
- 超时、AbortSignal、token 上限和审计记录必须齐全。

## 10. Git 工作流

提交格式：

```text
<type>(<scope>): <中文描述>
```

类型：`feat`、`fix`、`refactor`、`docs`、`db`、`config`、`test`。

规则：

- 一次提交只做一件事，第一行不超过 72 字。
- 修改前检查 `git status`，不覆盖他人未提交改动。
- 禁止 `git reset --hard`、无授权 `git clean` 和强推。
- 推送前运行相关测试、build 和 `git diff --check`。

## 11. 完成定义

- [ ] 模块边界符合规范。
- [ ] 输入、输出和错误均有类型/schema。
- [ ] 权限、敏感数据和并发/幂等已审查。
- [ ] 正常、边界、失败和恢复路径有测试。
- [ ] 相关文档已更新。
- [ ] lint、test、build、diff check 通过。
