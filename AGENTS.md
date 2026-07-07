# AI 面试模拟器

## 项目概述

AI 驱动的面试练习平台。用户选择岗位和难度，AI 出题、进行多轮对话面试、逐题评分并生成综合报告。

## 技术栈

- **框架**: TanStack React Start (SSR, React 19)
- **路由**: TanStack Router (文件路由，自动生成 routeTree.gen.ts)
- **数据获取**: TanStack React Query 5
- **样式**: Tailwind CSS 4 + shadcn/ui (Radix UI 原语)
- **构建**: Vite + Rolldown
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth (邮箱/密码)
- **AI**: DeepSeek Chat (OpenAI 兼容 API)
- **部署**: Vercel (Nitro SSR)

## 关键架构模式

### 1. Server Functions

所有后端业务逻辑通过 `createServerFn` 定义，位于 `src/lib/interview.functions.ts`。

- Server Fn 用 `.middleware([requireSupabaseAuth])` 保护，自动从请求头提取 Bearer token 完成认证
- 服务端代码通过 `*.server.ts` 后缀隔离（如 `ai-gateway.server.ts`），避免泄漏到客户端
- 输入校验使用 `zod` schema 通过 `.inputValidator()` 执行
- 客户端通过 `useServerFn()` 调用

### 2. 认证体系

两层认证机制：
1. **客户端**: `auth-attacher.ts` 作为全局 `functionMiddleware`，自动从 Supabase session 提取 access_token 附加到所有 server fn 请求头
2. **服务端**: `auth-middleware.ts` 校验 Bearer token，解析 claims，创建带认证的 Supabase 客户端注入 context

### 3. 数据库访问

三种 Supabase 客户端：
- `client.ts` (integrations/supabase/) — 浏览器端，通过 localStorage 持久化 session
- `client.server.ts` (integrations/supabase/) — 服务端 Service Role 客户端（绕过 RLS），仅用于管理操作
- auth middleware 内建 (auth-middleware.ts) — 服务端认证客户端，通过 Bearer token 鉴权

所有表均启用 RLS，通过用户 ID 进行数据隔离。

### 4. AI 集成

`src/lib/ai-gateway.server.ts` 封装 DeepSeek Chat API：
- `callAI(messages, model?)` — 发送消息，返回文本
- `parseJsonFromAI<T>(text)` — 从 AI 的 markdown 响应中提取 JSON

模型默认 `deepseek-chat`。

### 5. 面试流程

```
new.tsx → createInterviewSession → AI 出题 → 存入 DB
     → session.$id.tsx (多轮对话 / 评分 / 完成)
         → sendMessage → AI 对话（多轮）
         → evaluateConversation → AI 评分（单题）
         → finishSession → AI 综合总结
```

### 6. 错误处理

`server.ts` 包装全局 fetch handler，捕获 h3 吞掉的 SSR 错误。`error-capture.ts` 捕获全局 `error` 和 `unhandledrejection` 事件供后续恢复。

## 路由表

| 路径 | 文件 | 认证 | 说明 |
|------|------|------|------|
| / | routes/index.tsx | 否 | 着陆页 |
| /auth | routes/auth.tsx | 否 | 登录 / 注册 |
| /dashboard | routes/_authenticated/dashboard.tsx | 是 | 仪表盘 |
| /new | routes/_authenticated/new.tsx | 是 | 创建新面试 |
| /history | routes/_authenticated/history.tsx | 是 | 历史记录 |
| /session/$id | routes/_authenticated/session.$id.tsx | 是 | 面试会话页 |

## 开发约定

- 新增路由文件后运行 `npm run dev` 自动生成 `routeTree.gen.ts`
- 服务端专用模块命名 `*.server.ts`；客户端模块不用后缀
- 所有 Server Function 集中写在 `interview.functions.ts` 中
- 数据库 migration 放在 `supabase/migrations/`，按时间戳命名
- 使用 `@/` 别名引用 `src/` 下的模块
- 环境变量前缀 `VITE_` 暴露给客户端，纯服务端变量不用前缀

## 本地开发

```
npm install        # 安装依赖
npm run dev        # 启动开发服务器 (localhost:3000)
npm run build      # 构建生产包
npm run preview    # 本地预览构建产物
```
