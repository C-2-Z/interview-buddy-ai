# 工作交接：性能优化本地分支

更新时间：2026-07-11（Asia/Shanghai）

## 1. 当前任务边界

当前用户的最新要求是：

- 继续优化性能。
- 只允许在本地修改。
- 不推送 `main`、`cys` 或其他远端分支。
- 不触发、修改或删除任何远端部署。
- 不再修改或回滚生产数据库，除非用户再次明确授权。

下一个窗口开始工作前，必须先执行：

```powershell
git status --branch --short
git branch --show-current
```

预期工作分支：

```text
codex/performance-local
```

不要切回本地 `main` 继续开发，也不要执行 `git push`。

## 2. Git 状态

当前本地分支：

```text
codex/performance-local
```

本地性能优化相关提交：

```text
8ff126f refactor(logging): 统一后端日志并移除裸 console
e12af92 feat(performance): 新增渐进出题与低延迟语音链路
b870240 fix(api-server): 修复注释插入导致的语法错误
```

创建本交接文件前工作区是干净的。

远端只读核验结果：

```text
origin/main = 2e7cf4ccd93fbc0c3e0a6d9f51ab358c8f566a76
origin/cys  = 7070043e24eb056dc10871868aa7ab3a74c6eb44
```

本地 `main` 当前停在 `058d18c`，与远端 `main` 不一致；这是已有状态，不要擅自重置、变基或覆盖。

## 3. 已完成的性能优化

### 3.1 渐进式出题

- 新增 PostgreSQL Outbox 和会话生成状态字段。
- 使用 Redis + BullMQ 异步生成题目。
- Worker 流式解析模型输出，每得到一道合法题目立即入库。
- 支持部分成功、补偿生成、失败重试和断点继续。
- 前端使用 SSE 接收进度，2 秒轮询降级。
- 第一题生成后即可开始面试。
- 综合报告进入异步队列。

主要目录：

```text
api-server/src/modules/generation/
src/features/progressive-generation/
```

### 3.2 低延迟语音

- 浏览器按 20ms、16kHz PCM 音频帧发送。
- 增加 WebSocket `bufferedAmount` 背压和 2 秒有界队列。
- 麦克风、AudioContext 和 Worklet 在轮次间复用。
- 播放端改为 AudioWorklet 环形缓冲，预缓冲 60ms。
- Qwen TTS 支持单会话多次 `speak()`，正常轮次复用连接。
- 用户打断时关闭旧 TTS 并清空播放缓冲。
- 在面试官朗读期间预热下一轮 ASR。
- 将口语回复和追问/结束/评分决策合并为一次流式模型调用。
- 异常控制帧才回退到单独决策调用。

### 3.3 AI 和数据库优化

- DeepSeek 默认模型切换为 `deepseek-v4-flash`。
- 互动和出题显式关闭思考模式。
- AI 调用增加任务级超时、最大 Token、取消信号和 traceId。
- 会话和题目读取并行化。
- 下一未评分题使用 `score IS NULL ORDER BY order_index LIMIT 1`。
- 历史题目去重限制为最近 50 条。
- 用户请求路径不再执行过期会话清理。

### 3.4 性能指标和日志

- 新增 `api-server/src/modules/performance/`。
- 记录队列等待、AI TTFT、生成首题、ASR、TTS 和数据库阶段耗时。
- 所有后端裸 `console.*` 已移除。
- 日志统一使用 `consola` 和 `createModuleLogger(tag)`。
- 高频语音包日志默认关闭。
- 日志敏感字段自动脱敏。

## 4. 功能开关

本地示例默认全部关闭，避免误启用：

```env
PROGRESSIVE_GENERATION_ENABLED=0
VOICE_PERSISTENT_TTS_ENABLED=0
VOICE_SINGLE_PASS_DECISION_ENABLED=0
VOICE_VERBOSE_LOGS=0
```

本地测试时应逐项开启，不要一次全部打开。

## 5. 数据库现状

迁移文件：

```text
supabase/migrations/20260711000001_add_progressive_generation.sql
```

在用户叫停远端操作之前，该迁移已通过 Supabase 管理 API 以事务方式应用到生产数据库，并完成只读核验：

- 7 个生成状态字段存在。
- `background_jobs` 表存在。
- `create_progressive_interview_session(jsonb)` RPC 存在。
- 题目顺序唯一索引存在。
- Skill 历史索引存在。
- 会话清理索引存在。

重要问题：Supabase 远端迁移历史表原本为空，仓库旧迁移还有重复版本号。因此：

- 不要执行 `supabase db push`。
- 不要执行 `supabase db reset`。
- 不要重复运行渐进生成迁移。
- 不要运行 `migration repair`，除非用户明确要求整理生产迁移历史。

这些新增对象是向后兼容的；远端代码回退后可以保留。

## 6. Railway 现状

用户叫停前创建了 Railway 试用项目：

```text
Project: ezmock-production
Project ID: af9f1557-6233-4740-b7d6-6f5d9f8f2799
Region: SFO / 美国西部
```

服务状态：

- `Redis`：正在运行，会消耗试用额度。
- `ezmock-api`：构建失败，没有在线实例。
- `ezmock-generation-worker`：构建失败，没有在线实例。

当前禁止修改或删除这些资源。若用户希望停止试用额度消耗，必须先明确询问是否授权删除整个 Railway 项目或停止 Redis。

## 7. Vercel 现状

- Vercel CLI 已登录当前本机账户。
- 当前账户没有列出可管理的项目。
- `ezmock.site` 属于另一个不可访问的 Vercel 项目或团队。
- 不要创建新 Vercel 项目，不要修改域名，不要触发部署。

## 8. 验证结果

最近一次验证均在 `codex/performance-local` 上完成：

```text
后端单元测试：3/3 通过
后端 TypeScript 构建：通过
前端 Vite + SSR 构建：通过
git diff --check：通过
后端裸 console.* 搜索：0 处
```

前端仍有一个非阻塞构建警告：主 chunk 超过 500kB。该警告不是本轮功能错误，但可以作为后续本地优化项。

## 9. 下一个目标

### P0：补齐本地集成测试

在不访问生产服务的前提下，优先完成：

1. 使用本地 Redis/Valkey 测试 BullMQ API、Dispatcher 和 Worker。
2. 覆盖 Outbox 双写、重复 job、Worker 重启、部分生成继续。
3. 覆盖 SSE 重连、数据库快照恢复和轮询降级。
4. 使用 `VOICE_MOCK_QWEN=1` 验证单 TTS 连接、多轮 speak、打断和 ASR 预热。
5. 为合并式 `<speech>/<decision>` 流式解析补充跨 chunk 和异常回退测试。

### P1：本地性能基线

1. 给 Mock AI 增加可配置首 Token 延迟和 chunk 间隔。
2. 本地运行 50 并发创建和 100 SSE 连接压测。
3. 输出创建确认、第一题、LLM TTFT、TTS 首包等 P50/P95。
4. 检查 API 事件循环是否出现持续阻塞。

### P2：前端包体优化

当前 `evaluation-radar` 和主入口 chunk 较大，可在本地评估：

- 对雷达图或 Recharts 使用动态导入。
- 对报告页和非首屏页面进一步拆包。
- 比较优化前后的首屏 JS 体积，不要为了消除警告盲目拆分。

## 10. 推荐启动命令

只使用本地依赖和 Mock 服务：

```powershell
npm install

Set-Location api-server
npm install
npm test
npm run build
Set-Location ..

npm run build
```

如果本机已经有 Redis：

```powershell
Set-Location api-server
npm run dev
```

另一个终端：

```powershell
Set-Location api-server
npm run worker:dev
```

前端：

```powershell
npm run dev
```

## 11. 明确禁止事项

在用户再次授权之前，不要执行：

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
```

也不要清理、重置或覆盖本地 `main`、`cys` 和用户已有分支。

## 12. 相关文档

- 部署文档：`DEPLOYMENT.md`
- 环境变量示例：`.env.example`
- Railway API 配置：`api-server/railway-api.toml`
- Railway Worker 配置：`api-server/railway-worker.toml`
- 渐进生成迁移：`supabase/migrations/20260711000001_add_progressive_generation.sql`
