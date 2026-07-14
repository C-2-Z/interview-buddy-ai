# EzMock 生产部署指南

本文档适用于以下部署架构：

- 前端：Vercel
- API：Railway 美国区域，优先美国西部
- 后台任务 Worker：Railway，与 API 同区
- Redis：与 API 同区的原生 Redis/Valkey TCP 服务
- 数据库与认证：现有 Supabase 项目
- 语音服务：Qwen 北京端点

> 生产环境不得把 `.env`、API Key、Supabase Service Role Key 或 Redis 密码提交到 Git。

## 1. 发布前检查

在仓库根目录执行：

```powershell
npm install
npm run build

Set-Location api-server
npm install
npm test
npm run build
Set-Location ..
```

确认测试和前后端构建均通过后，检查待提交文件：

```powershell
git status
git diff --check
```

提交代码，但先不要推送：

```powershell
git add .
git commit -m "feat(performance): 新增渐进出题与低延迟语音链路"
```

## 2. 迁移 Supabase 数据库

本项目的 Supabase Project Ref 为：

```text
sgrwsljvglfuwgzbjkmo
```

登录并关联项目：

```powershell
npx supabase login
npx supabase link --project-ref sgrwsljvglfuwgzbjkmo
npx supabase migration list
```

当前仓库历史中有两组重复的旧迁移版本号：

```text
20260708000001
20260709000001
```

这些旧迁移可能已经在生产库执行，未经核对不要直接重命名或重新执行。登录后先比较 `migration list` 的 Local/Remote 结果；如果列表不一致或 `db push` 报迁移历史冲突，停止发布并按本节后面的“迁移历史冲突处理”操作。

先预览迁移：

```powershell
npx supabase db push --dry-run
```

确认输出包含以下迁移文件：

```text
20260711000001_add_progressive_generation.sql
```

然后正式执行：

```powershell
npx supabase db push
```

### 2.1 迁移历史冲突处理

只有普通 `db push` 因旧版迁移历史不一致而失败时，才使用以下备用流程：

1. 在 Supabase Dashboard 的 SQL Editor 中打开并完整执行 `supabase/migrations/20260711000001_add_progressive_generation.sql`。
2. 确认 SQL 全部执行成功，且 `background_jobs` 表和新增会话字段存在。
3. 再在本地将该版本标记为远端已执行：

```powershell
npx supabase migration repair --status applied 20260711000001
npx supabase migration list
```

仅在 SQL 已成功执行后才能运行 `migration repair --status applied`。它只修复迁移历史，不会代替 SQL 执行。

迁移文件位于：

```text
supabase/migrations/20260711000001_add_progressive_generation.sql
```

注意事项：

- 生产库禁止执行 `supabase db reset`。
- 建议迁移前创建数据库备份。
- 如果迁移历史不一致，先运行 `npx supabase migration list` 排查，不要直接修改生产表。
- 参考：[Supabase 数据库迁移文档](https://supabase.com/docs/guides/deployment/database-migrations)

## 3. 创建 Redis

### 3.1 Railway Redis

在 Railway 的同一个 Project 中：

1. 点击 `New`。
2. 选择 `Database`。
3. 选择 `Redis`。
4. Region 选择与 API 相同的美国区域。
5. 记录 Redis 服务名称，例如 `Redis`。

API 和 Worker 的 `REDIS_URL` 使用 Railway 引用变量：

```env
REDIS_URL=${{Redis.REDIS_URL}}
```

如果 Redis 服务名不是 `Redis`，需替换为实际服务名。

Redis 必须提供原生 TCP 连接，不能使用仅支持 REST HTTP 的 Redis 产品。

参考资料：

- [Railway Redis](https://docs.railway.com/databases/redis)
- [Railway 环境变量](https://docs.railway.com/variables)

### 3.2 严格 TLS 方案

如果生产规范要求 Redis 连接必须使用 TLS，可采用同一美国区域的 Redis Cloud，并配置：

```env
REDIS_URL=rediss://default:<password>@<redis-host>:<port>
```

不要把密码写入代码或提交到 Git。

参考：[Redis Cloud TLS](https://redis.io/docs/latest/operate/rc/security/database-security/tls-ssl/)

## 4. 部署 Railway API

在 Railway 中从 GitHub 仓库创建服务，配置如下：

```text
Service Name: ezmock-api
Root Directory: /api-server
Build Command: npm ci && npm run build
Start Command: npm run start
Region: US West 或当前使用的美国区域
Health Check Path: /api/health
```

仓库已提供 API 配置文件：

```text
/api-server/railway-api.toml
```

在 Railway Service Settings 中把 Config File Path 设置为上述路径，即可复用构建、启动、健康检查和重启策略。

建议初始只运行一个 API Replica，完成稳定性验证后再扩容。

参考：[Railway Monorepo 部署](https://docs.railway.com/deployments/monorepo)

### 4.1 API 环境变量

在 Railway API Service 的 Variables 中设置：

```env
SUPABASE_URL=<supabase-url>
SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>

ENCRYPTION_KEY=<existing-64-character-hex-key>
DEEPSEEK_API_KEY=<deepseek-api-key>
OPENAI_API_KEY=<optional-openai-api-key>
ANTHROPIC_API_KEY=<optional-anthropic-api-key>

AI_BAILIAN_API_KEY=<bailian-api-key>
QWEN_ASR_URL=wss://<workspace-id>.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime
QWEN_TTS_URL=wss://<workspace-id>.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime
QWEN_ASR_MODEL=qwen3-asr-flash-realtime
QWEN_TTS_MODEL=qwen3-tts-flash-realtime
QWEN_TTS_VOICE=Cherry
QWEN_ASR_SAMPLE_RATE=16000
QWEN_TTS_SAMPLE_RATE=24000
VOICE_WS_TOKEN_SECRET=<long-random-secret>

REDIS_URL=${{Redis.REDIS_URL}}
QUESTION_WORKER_CONCURRENCY=4
PERFORMANCE_SAMPLE_RATE=1

AI_INTERACTIVE_TIMEOUT_MS=45000
AI_GENERATION_TIMEOUT_MS=90000
AI_REPORT_TIMEOUT_MS=60000

PROGRESSIVE_GENERATION_ENABLED=0
VOICE_PERSISTENT_TTS_ENABLED=0
VOICE_SINGLE_PASS_DECISION_ENABLED=0
VOICE_VERBOSE_LOGS=0
VOICE_MOCK_QWEN=0
```

关键注意事项：

- `ENCRYPTION_KEY` 必须沿用现有生产值。重新生成会导致已保存的用户 API Key 无法解密。
- `SUPABASE_SERVICE_ROLE_KEY` 只能放在 API 和 Worker 中，不能暴露给 Vercel 客户端。
- `VOICE_WS_TOKEN_SECRET` 在所有 API Replica 中必须保持一致。
- `VOICE_MOCK_QWEN` 在生产环境必须为 `0`。
- 不要手动固定 `PORT`，Railway 会自动注入端口。

### 4.2 API 域名

为 API 生成 Railway 公网域名，建议绑定：

```text
api.ezmock.site
```

确认 HTTPS 可用，并且代理支持 WebSocket Upgrade 和 SSE 长连接。

## 5. 部署 Railway Worker

从同一个 GitHub 仓库创建第二个 Railway 服务：

```text
Service Name: ezmock-generation-worker
Root Directory: /api-server
Build Command: npm ci && npm run build
Start Command: npm run worker:start
Region: 与 API 和 Redis 完全相同
Replicas: 1
```

仓库已提供 Worker 配置文件：

```text
/api-server/railway-worker.toml
```

在 Worker 的 Railway Service Settings 中把 Config File Path 设置为上述路径。

Worker 不需要公网域名。

推荐将后端变量配置成 Railway Shared Variables，并共享给 API 和 Worker。Worker 至少需要：

```env
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
ENCRYPTION_KEY
DEEPSEEK_API_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
REDIS_URL
QUESTION_WORKER_CONCURRENCY
AI_GENERATION_TIMEOUT_MS
AI_REPORT_TIMEOUT_MS
PROGRESSIVE_GENERATION_ENABLED
PERFORMANCE_SAMPLE_RATE
```

Worker 成功启动后，日志应包含：

```text
[generation-worker] ready concurrency=4
```

## 6. 推送代码并触发部署

确认数据库迁移成功、Redis 已建立、Railway 环境变量已配置后执行：

```powershell
git push origin main
```

如果 Vercel 和 Railway 已关联 GitHub `main` 分支，这次推送会触发自动部署。

## 7. 配置 Vercel 前端

进入 Vercel：

```text
Project -> Settings -> Environment Variables
```

为 Production 配置：

```env
VITE_SUPABASE_PROJECT_ID=sgrwsljvglfuwgzbjkmo
VITE_SUPABASE_URL=<supabase-url>
VITE_SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-key>
VITE_API_URL=https://api.ezmock.site
```

注意事项：

- `VITE_API_URL` 末尾不要添加 `/`。
- Vercel 中只能配置允许公开到浏览器的 `VITE_*` 变量。
- 禁止把 Service Role Key、Redis URL、AI Key 或加密密钥放进 Vercel 前端变量。
- 环境变量修改后必须重新部署才能生效。

参考：[Vercel 环境变量](https://vercel.com/docs/environment-variables)

## 8. 检查 CORS

当前 API 默认允许以下前端来源：

```text
https://ezmock.site
https://www.ezmock.site
http://localhost:3000
http://localhost:5173
```

配置文件：

```text
api-server/src/config/cors.ts
```

如果生产前端、Capacitor 或 Tauri 使用其他 origin，在 API 服务设置逗号分隔的精确白名单，例如：

```env
CORS_ALLOWED_ORIGINS=https://localhost,tauri://localhost
```

通配符、带路径的地址和未知协议会在 API 启动时被拒绝。当前 Vercel Preview 随机域名默认不会通过 CORS。

## 9. 首次生产验证

首次部署时保持以下功能开关为 `0`：

```env
PROGRESSIVE_GENERATION_ENABLED=0
VOICE_PERSISTENT_TTS_ENABLED=0
VOICE_SINGLE_PASS_DECISION_ENABLED=0
```

### 9.1 检查 API

```powershell
Invoke-RestMethod https://api.ezmock.site/api/health
Invoke-RestMethod https://api.ezmock.site/api/performance/health
```

健康检查预期返回：

```json
{
  "status": "ok"
}
```

### 9.2 检查基础功能

- Railway API 日志没有数据库字段错误。
- Worker 日志显示 `ready concurrency=4`。
- Redis 显示 API 和 Worker 客户端连接。
- 用户可以登录并创建普通文字面试。
- 用户可以进入语音面试。
- 浏览器能够建立 `wss://api.ezmock.site/api/voice/ws` 连接。
- 录音、ASR、模型回复和 TTS 播放正常。
- Supabase 中存在 `background_jobs` 表及新增的生成状态字段。

## 10. 逐项启用优化

每次只启用一个功能，完成验证后再启用下一个。环境变量修改后需要重新部署对应服务。

### 10.1 启用持久 TTS 连接

API 设置：

```env
VOICE_PERSISTENT_TTS_ENABLED=1
```

验证多轮语音正常、打断后没有旧音频串入下一轮。

### 10.2 启用单次模型决策

API 设置：

```env
VOICE_SINGLE_PASS_DECISION_ENABLED=1
```

验证回复、追问、结束和评分动作正常。

### 10.3 启用渐进式出题

API 和 Worker 必须同时设置：

```env
PROGRESSIVE_GENERATION_ENABLED=1
```

验证：

- 创建面试返回 HTTP `202`。
- 第一题生成后立即出现在页面。
- 后续题目持续增加。
- SSE 断开后可以通过轮询恢复进度。
- Worker 没有持续失败或重复生成题目。
- 页面刷新后仍能从数据库恢复已有题目。
- 综合报告能够异步完成并更新页面。

当前功能开关是全局布尔开关，不是内置百分比流量开关。若要严格执行 10%/50%/100% 用户灰度，需要独立环境、平台流量分配，或增加基于用户 ID 的稳定哈希分流逻辑。

## 11. 回滚策略

如果错误率明显上升，优先关闭对应功能开关，不回滚数据库迁移：

```env
PROGRESSIVE_GENERATION_ENABLED=0
VOICE_PERSISTENT_TTS_ENABLED=0
VOICE_SINGLE_PASS_DECISION_ENABLED=0
```

回滚后重新部署 API；渐进生成开关同时同步到 Worker。

数据库新增字段、索引和 `background_jobs` 表可以保留，不影响旧同步流程。

## 12. 上线验收目标

- 创建请求确认 P95 不超过 1.2 秒。
- 第一题可见 P95 不超过 4 秒。
- 结束回答到 ASR final P95 不超过 1.5 秒。
- 首段文字 P95 不超过 2.8 秒。
- 首段语音 P95 不超过 4 秒。
- 首段语音 P95 相比旧版本降低至少 35%。
- 队列成功率不低于 99.5%。
- 错误率增长不超过 0.5%。

验收应以中国大陆桌面网络和移动网络的真实样本为准。
