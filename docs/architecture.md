# 系统架构设计

> 状态：当前；最后核验：2026-07-16

## 1. 架构目标

- 将模型能力限制在可审计、可校验的业务边界内。
- 在刷新、断线、并发请求和进程重启后恢复面试。
- 通过模块化结构支持持续扩展。
- 让 Web 与桌面客户端共享前端业务和远端服务。
- 让用户数据、密钥、回答、网页和模型输出经过明确的信任边界。

## 2. 系统上下文

```text
用户
  +-> Web SSR（Vercel）
  +-> Tauri Windows（WebView2）
           |
           | Supabase Auth / HTTPS / SSE / WSS
           v
        Hono API
           +-> Supabase PostgreSQL + RLS + RPC
           +-> LangGraph Checkpoint PostgreSQL
           +-> DeepSeek / OpenAI / Anthropic
           +-> Qwen ASR / TTS / Embedding / Search
           +-> Tavily / Wikimedia
```

## 3. 容器视图

### 3.1 前端

`src/` 服务两种构建：

- Web SSR：`vite.config.ts` -> `dist/client` + `dist/server`。
- Native SPA：`vite.native.config.ts` -> `dist-native/client`。

边界：

- `src/routes/`：文件路由和页面壳。
- `src/features/`：业务 UI、hooks、API 和类型。
- `src/shared/api/`：URL、Bearer Token、错误、上传和流式请求。
- `src/shared/runtime/`：Web/Native 公开运行配置。
- `src/shared/platform/`：存储、WebSocket、麦克风、全屏和 Wake Lock。

### 3.2 API

`api-server/` 是独立 Node.js 服务：

```text
HTTP/WS request
  -> Hono route
  -> Zod schema
  -> service
  -> repository/provider
  -> database/model/external service
```

`app.ts` 挂载模块；`serve.ts` 启动 HTTP、初始化 checkpoint 并安装语音 WebSocket upgrade。

### 3.3 数据

- Supabase Auth：身份与 access token。
- Supabase PostgreSQL：业务表、RLS、原子 RPC、pgvector。
- Checkpoint PostgreSQL：`langgraph` schema，保存 Graph 中断/恢复状态。

业务数据库和 checkpoint 即使在同一实例中，也属于不同事务边界。

### 3.4 AI 与外部服务

- Chat：DeepSeek、OpenAI、Anthropic。
- 语音：Qwen Realtime ASR/TTS。
- Embedding：DashScope `text-embedding-v3`，1024 维。
- 联网：Tavily 优先；无 Key 时 Wikimedia；也可禁用。

## 4. 状态架构

| 状态       | 存储                           | 权威性                      |
| ---------- | ------------------------------ | --------------------------- |
| 业务状态   | Supabase 表/RPC                | 用户可见事实的唯一真相源    |
| Agent 状态 | LangGraph checkpoint           | 节点执行和 interrupt/resume |
| 客户端恢复 | `agent_events` + workspace RPC | 已提交事件和页面聚合投影    |

约束：

- checkpoint 不能代替业务表。
- SSE 只发布已持久化事件。
- 前端不能从本地动画推测业务提交。
- 终态提交后即使 checkpoint 删除失败，也不得恢复写入。

### 4.1 一致性

- 每次推进使用稳定 operation key。
- RPC claim/commit/fail 原子更新业务状态与事件序号。
- 重复请求返回第一次结果；并发请求只有一个 claim 成功。
- SSE 使用严格递增 sequence；游标缺口或越界时同步最新 snapshot。
- 模型失败只保存稳定错误码，不暴露原始报文。

## 5. 关键数据流

### 5.1 创建面试

```text
创建向导 -> readiness -> POST Agent session
  -> 解析模型/体验模式/冻结配置
  -> 创建 Agent v3 业务会话 -> HTTP 202
  -> 后台 Graph prepare
  -> 策略、工具、研究、选题
  -> 原子提交首题 + snapshot + events
  -> SSE 通知前端
```

### 5.2 文字回答

```text
前端 inputId -> 持久化输入 -> operation claim
  -> Graph resume(inputId)
  -> guard -> evidence -> decision
  -> 追问或评分/换题/报告
  -> 原子提交投影与事件
```

回答正文只在业务存储和当前模型调用内出现；Graph State 保存引用。

### 5.3 语音回答

```text
voice/connect -> 短期一次性 token -> WSS
  -> PCM -> Qwen ASR partial/final
  -> final transcript + voice:<turnId>
  -> Canonical Agent submitInput
  -> 读取本次已提交 events
  -> Qwen TTS/客户端事件
```

### 5.4 知识库

```text
上传 -> processor -> splitter -> embedding
  -> chunks/vector -> graph edges -> default Brain

QA -> query rewrite -> vector search -> compression
  -> untrusted boundary -> streaming answer + citations
```

## 6. 部署架构

```text
Vercel: Web SSR
Railway/Node platform: Hono API + WebSocket/SSE
Supabase Cloud: Auth/PostgreSQL/pgvector
Tauri MSI: dist-native/client only
```

API 平台必须支持 WebSocket Upgrade 和长连接 SSE。Native 包不包含 Hono、service role、AI Key、数据库连接或加密密钥。

## 7. 关键决策

| 决策                  | 原因                   | 代价                    |
| --------------------- | ---------------------- | ----------------------- |
| 单一 Agent v3         | 消除版本分支和恢复歧义 | 旧未完成会话不能继续    |
| PostgreSQL Checkpoint | 跨进程恢复             | 增加部署和清理运维      |
| 持久事件 SSE          | 可重放、可审计         | 需要事件保留和游标逻辑  |
| RPC 原子提交          | 保护幂等和投影一致性   | 数据库契约更复杂        |
| 题库优先、模型兜底    | 成本、质量、可追溯     | 需要严格匹配            |
| 回答不进 checkpoint   | 隐私和体积安全         | 恢复需要输入 Repository |
| 平台适配器            | Web/Tauri 共享 feature | 适配器需独立测试        |

## 8. 已知风险

- Supabase 迁移历史尚未建立可靠基线。
- OpenAPI 与实际挂载路由存在旧接口差异。
- 语音短期 token 位于单进程内存，多副本需共享存储或粘性路由。
- Native dev URL、Web 端口和旧脚本需统一。
- 主入口 bundle 约 624 kB。
