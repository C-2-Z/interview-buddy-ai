# 部署与运维指南

> 状态：当前；最后核验：2026-07-16

## 1. 部署组成

| 组件      | 推荐目标                          | 产物/入口                             |
| --------- | --------------------------------- | ------------------------------------- |
| Web SSR   | Vercel                            | `dist/client`、`api/ssr.js`           |
| API       | Railway 或支持 Node/WS/SSE 的平台 | `api-server/dist/serve.js`            |
| 数据/认证 | Supabase Cloud                    | PostgreSQL、Auth、RLS、pgvector       |
| Windows   | Tauri 2 MSI                       | `src-tauri/target/release/bundle/msi` |

当前没有可运行的 generation Worker。`api-server/railway-worker.toml` 指向不存在的 `worker:start`，不得部署。

## 2. 发布前检查

```powershell
npm ci
npm test
npm run lint
npm run build
npm run build:native
npm run verify:native

Set-Location api-server
npm ci
npm test
npm run build
Set-Location ..

git diff --check
```

生产变更还需检查：

- 数据库 migration 与 readiness 预期版本。
- API 域名、Vercel `VITE_API_URL`、Tauri CSP 和 CORS 一致。
- HTTPS、WSS、WebSocket Upgrade 和 SSE 超时。
- AI、Qwen、Checkpoint、加密和 token 密钥完整。

## 3. 数据库

### 3.1 必需能力

- Supabase Auth。
- pgvector 扩展。
- 当前全部业务表、RLS、Agent v3 RPC。
- `langgraph` checkpoint schema。

### 3.2 当前迁移风险

远端 migration history 未建立可靠基线，仓库有早期重复版本。禁止直接：

```text
supabase db push
supabase db reset
supabase migration repair
```

生产迁移流程应为：

1. 只读导出/比对远端 schema 和函数签名。
2. 在隔离数据库从已确认基线应用新增迁移。
3. 验证 RLS、RPC、readiness 和回滚。
4. 经用户明确授权后，以事务方式只应用目标增量。
5. 记录版本、时间、执行人和核验结果。

## 4. API 部署

`api-server/railway-api.toml`：

```text
Build: npm ci && npm run build
Start: npm run start
Health: /api/health
```

平台要求：

- Node.js 20+，建议 22。
- 支持 WebSocket Upgrade。
- 支持长连接 SSE，不做过短代理超时。
- 单副本可使用当前内存语音 token；多副本前需改造共享 token/路由。

### 4.1 API 环境变量

```env
NODE_ENV=production
PORT=3001
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
ENCRYPTION_KEY=
DEEPSEEK_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
AGENT_INTERVIEW_ENABLED=1
AGENT_PROMPT_VERSION=agent-v3
AGENT_CHECKPOINT_SCHEMA=langgraph
AGENT_ALLOW_MEMORY_CHECKPOINTER=0
AGENT_WEB_RESEARCH_ENABLED=1
AGENT_PUBLIC_WEB_RESEARCH_ENABLED=1
TAVILY_API_KEY=
AI_BAILIAN_API_KEY=
QWEN_ASR_URL=
QWEN_TTS_URL=
VOICE_WS_TOKEN_SECRET=
CORS_ALLOWED_ORIGINS=
```

生产不允许 MemorySaver。语音 URL 中不能保留 `{WorkspaceId}` 占位符。

## 5. Web 部署

`vercel.json`：

- install：`npm install`
- build：`npm run build`
- output：`dist/client`
- rewrite：所有页面到 `/api/ssr`

Vercel 公开变量：

```env
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_API_URL=https://backend.ezmock.site
```

只配置浏览器可公开的变量。修改后重新部署。

## 6. CORS 与域名

默认 Web 开发来源和生产域名由 `api-server/src/config/cors.ts` 管理。额外 Native 来源通过精确、逗号分隔的 `CORS_ALLOWED_ORIGINS` 添加。

- 禁止 `*`。
- 禁止带路径、凭据和未知协议的 origin。
- Preview 随机域名默认不会自动放行。
- 更换 API 域名时同步 Web、Tauri CSP、WSS 和 Supabase redirect。

## 7. Tauri Windows

生产 Native 构建读取 `.env.production`，当前目标 API 为 `https://backend.ezmock.site`。

```powershell
npm run tauri:build
```

发布前人工验证：

- 纯净 Windows 安装与 WebView2。
- 登录/刷新、文件选择、麦克风、SSE/WSS。
- CSP 不阻断 API、Supabase 和资源。
- 升级、卸载、应用标识、图标、中文名称和代码签名。

## 8. 上线核验

1. `GET /api/health` 返回 `{"status":"ok"}`。
2. 已登录请求可访问 `/api/agent/readiness`，状态符合环境。
3. 创建文字会话、看到首题、完成一次输入和 SSE。
4. 生成报告并从历史页恢复。
5. 有语音配置时完成一轮 WSS ASR/TTS。
6. 上传知识文档，状态 ready，可搜索/问答。
7. 日志无凭据、正文泄露或持续错误。

## 9. 回滚

- 优先关闭 `AGENT_INTERVIEW_ENABLED` 或研究/语音能力，而不是删除数据。
- 部署上一个已验证应用版本。
- 保留向后兼容的新表、列和索引，除非有单独的数据回滚设计。
- 业务终态与 checkpoint 清理失败分开处理；不要恢复已终态会话写入。
- 回滚后重新执行健康、readiness 和主链路核验。

## 10. 运维观测

- consola 模块 tag 和稳定 event 名称。
- 模型耗时、token、失败码和 operation trace。
- SSE 重连、语音 ASR/TTS、数据库阶段和采样率。
- `VOICE_VERBOSE_LOGS=0` 默认抑制高频音频包日志。
- 日志不得包含 Key、token、Authorization、简历或回答全文。
