# AI 面试模拟器

## 项目概述

AI 驱动的面试练习平台。用户选择岗位和难度，AI 出题、进行多轮对话面试、逐题评分并生成综合报告。

## 技术栈

- **前端框架**: TanStack React Start (SSR, React 19)
- **路由**: TanStack Router (文件路由，自动生成 routeTree.gen.ts)
- **数据获取**: TanStack React Query 5
- **样式**: Tailwind CSS 4 + shadcn/ui (Radix UI 原语)
- **构建**: Vite + Rolldown
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth (邮箱/密码)
- **AI**: DeepSeek Chat (OpenAI 兼容 API)
- **API 服务**: Hono (独立后端服务)
- **部署**: Vercel (前端 SSR) + 独立 API 服务

## 项目结构

```
interview-buddy-ai/
├── src/                    # 前端 (TanStack React Start SSR)
│   ├── lib/
│   │   ├── api-client.ts   # API 客户端，调用远程 API 服务
│   │   └── ...
│   ├── routes/             # 页面路由组件
│   └── ...
├── api-server/             # 独立后端 API 服务 (Hono)
│   ├── src/
│   │   ├── index.ts        # Hono 入口
│   │   ├── serve.ts        # Node.js 服务器启动
│   │   ├── routes/
│   │   │   ├── sessions.ts # 面试会话 CRUD
│   │   │   └── questions.ts# 对话消息与评分
│   │   ├── middleware/
│   │   │   └── auth.ts     # JWT 认证中间件
│   │   └── lib/
│   │       ├── ai-gateway.ts  # DeepSeek API 封装
│   │       └── supabase.ts    # Supabase 客户端工厂
│   └── ...
└── ...
```

## 前后端架构

前端通过 `src/lib/api-client.ts` 调用后端 API，完全替代了原有的 `createServerFn`。

```
[浏览器] ──→ Vite 代理 (开发) / 直接 API 地址 (生产) ──→ API 服务 (Hono) ──→ Supabase + DeepSeek
```

- **开发环境**: Vite 开发服务器自动代理 `/api/*` 到 `localhost:3001`
- **生产环境**: 通过 `VITE_API_URL` 环境变量指定 API 服务地址
- **认证**: API 客户端自动从 Supabase session 获取 access_token，附加到请求头

## 关键架构模式

### 1. API 客户端 (`src/lib/api-client.ts`)

所有后端业务逻辑通过 `apiClient` 对象调用：

```ts
import { apiClient } from "@/lib/api-client";

// 创建面试会话
const { sessionId } = await apiClient.createInterviewSession({
  position: "前端工程师",
  difficulty: "中级",
  jobDescription: "岗位要求 3 年经验，熟悉 React/TypeScript",
  questionCount: 5,
});

// 发送对话消息
const { response } = await apiClient.sendMessage(questionId, "我的回答是...");

// 获取面试会话
const { session, questions } = await apiClient.getSession(sessionId);

// 评价对话
const { score, feedback } = await apiClient.evaluateConversation(questionId);

// 完成面试
const { overallScore, overallFeedback } = await apiClient.finishSession(sessionId);
```

### 2. API 服务 (`api-server/`)

Hono 框架提供的 REST API：

| 方法 | 路径                        | 说明                    |
| ---- | --------------------------- | ----------------------- |
| POST | /api/sessions               | 创建面试会话 + 生成题目 |
| GET  | /api/sessions               | 列出所有面试            |
| GET  | /api/sessions/:id           | 获取面试详情 + 题目列表 |
| POST | /api/sessions/:id/finish    | 完成面试并生成总结      |
| POST | /api/questions/:id/message  | 发送对话消息            |
| POST | /api/questions/:id/evaluate | 评价对话并评分          |

### 3. 认证体系

两层认证机制：

1. **客户端**: `auth-attacher.ts` 作为全局 `functionMiddleware`，自动从 Supabase session 提取 access_token
2. **API 服务端**: `auth.ts` Hono 中间件校验 Bearer token，解析 claims，创建带认证的 Supabase 客户端注入 context

### 4. 数据库访问

三种 Supabase 客户端：

- `client.ts` — 浏览器端，通过 localStorage 持久化 session
- `client.server.ts` — 服务端 Service Role 客户端（绕过 RLS），仅用于管理操作
- API 服务内建 — 通过 Bearer token 鉴权，RLS 隔离

所有表均启用 RLS，通过用户 ID 进行数据隔离。

### 5. AI 集成

`api-server/src/lib/ai-gateway.ts` 封装 DeepSeek Chat API：

- `callAI(messages, model?)` — 发送消息，返回文本
- `parseJsonFromAI<T>(text)` — 从 AI 的 markdown 响应中提取 JSON

### 6. 面试流程

```
前端 (new.tsx) → API POST /api/sessions → AI 出题 → 存入 DB → 重定向到 /session/:id
  → 多轮对话 (POST /api/questions/:id/message) → 评价 (POST /api/questions/:id/evaluate)
  → 完成 (POST /api/sessions/:id/finish) → AI 综合总结
```

## 路由表

| 路径                                                   | 文件                                | 认证       | 说明        |
| ------------------------------------------------------ | ----------------------------------- | ---------- | ----------- |
| /                                                      | routes/index.tsx                    | 否         | 着陆页      |
| /auth                                                  | routes/auth.tsx                     | 否         | 登录 / 注册 |
| /dashboard                                             | routes/_authenticated/dashboard.tsx | 是         | 仪表盘      |
| /new                                                   | routes/_authenticated/new.tsx       | 是         | 创建新面试  |
| /history                                               | routes/_authenticated/history.tsx   | 是         | 历史记录    |
| /session/$id | routes/_authenticated/session.$id.tsx | 是                                  | 面试会话页 |             |

## 本地开发

```bash
# 安装依赖
npm install
cd api-server && npm install && cd ..

# 启动开发 (两个终端)
npm run dev          # 前端开发服务器 (localhost:3000)
npm run api:dev      # API 服务 (localhost:3001)

# 或同时启动
npm run dev:all      # 需要先安装 concurrently: npm install -g concurrently

# 构建
npm run build        # 构建前端

# 验证 API 服务
curl http://localhost:3001/api/health
```

## 部署

### 前端 (Vercel)

- 保持现有 Vercel 配置 (`vercel.json`)
- 设置 `VITE_API_URL` 环境变量指向生产 API 地址

### API 服务

- 可部署到 Railway、Render、Fly.io 等 Node.js 平台
- 环境变量: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `DEEPSEEK_API_KEY`, `PORT`
- 启动命令: `cd api-server && npm run start`

### App 打包 (后续)

- Android/iOS: Capacitor (构建 SPA 后 `npx cap copy`)
- Windows: Tauri (构建 SPA 后 `npx tauri build`)

## 开发约定

- 新增路由文件后运行 `npm run dev` 自动生成 `routeTree.gen.ts`
- 服务端专用模块命名 `*.server.ts`；客户端模块不用后缀
- API 路由逻辑写在 `api-server/src/routes/` 下
- 使用 `@/` 别名引用 `src/` 下的模块
- 环境变量前缀 `VITE_` 暴露给客户端，纯服务端变量不用前缀
- API 服务通过 `.env` 文件加载环境变量
## Git 提交规范

本项目采用 **Conventional Commits + 中文描述** 的提交格式，要求统一、清晰、可读。

### 基本格式

```
<type>: <中文描述>
```

说明文字在第一行之后空一行写，按需添加。

### 类型 (type)

| 类型       | 场景                                                   | 示例                                       |
| ---------- | ------------------------------------------------------ | ------------------------------------------ |
| `feat`     | 新功能、新页面、新 API 端点                             | `feat: 新增限时模式倒计时功能`             |
| `fix`      | Bug 修复                                               | `fix: 修复评分计算精度溢出问题`            |
| `refactor` | 代码重构（不修 Bug 也不加功能）                         | `refactor: 抽离 AI 评分逻辑为独立服务`     |
| `docs`     | 文档变更（README、AGENTS、TODO 等）                     | `docs: 更新部署流程与环境变量说明`         |
| `style`    | 样式 / UI 调整，不改变逻辑                              | `style: 调整面试详情页卡片间距`            |
| `perf`     | 性能优化                                               | `perf: 会话列表接口增加分页参数`           |
| `test`     | 增删测试                                               | `test: 增加 ai-gateway 单元测试`           |
| `chore`    | 构建、依赖、CI 等杂项                                   | `chore: 升级 hono 到 4.7.6`               |
| `db`       | 数据库迁移（新增/修改表结构或 RLS 策略）                | `db: 新增 interview_messages 表`           |
| `config`   | 配置文件变更（vite、vercel、tsconfig 等）               | `config: 新增 Dockerfile 部署配置`         |
| `i18n`     | 国际化 / 多语言相关内容                                 | `i18n: 添加面试页面英文翻译`              |

### 原则

- **第一行不超过 72 字**，用中文描述做了什么，结尾不加句号
- **动词用过去时**：`修复` / `新增` / `重构`，不用 `修复了` / `修复中`
- **说明文字只在需要时写**：解释"为什么"而不是"做了什么"，例如：

```
feat: 增加 AI 追问次数限制

防止单题对话无限循环，每道题最多追问 5 轮后自动引导用户评分。
```

- **关联 TODO 编号**：如果提交对应 TODO.md 中的条目，在说明文字中标注，例如：

```
feat: 新增编程题在线编辑器

Phase 2 / A3 — 内置 Monaco 编辑器 + AI 代码评审入口。
```

- **范围限定（可选）**：对跨模块的大改动，在 type 后加 `(scope)` 缩小关注面：

```
refactor(api-server): 抽离 Supabase 客户端工厂
feat(frontend): 新增 /settings 页面
```

- **不加 `-m` 长文本**：需要说明文字的提交，分 body 写，或直接用编辑器编辑消息

### 反例

```
# ❌ 不清晰
update code

# ❌ 类型太多，无实质内容
chore: fix some issues

# ❌ 描述过长、包含句号
refactor: 重构了之前那个面试服务的代码结构，把很多东西移到了新的目录下面。

# ❌ 同时做多个事情
feat: 新增历史页面并修复登录bug

# ✓ 正确做法：拆成两个提交
feat: 新增面试历史列表页面
fix: 修复登录后 token 未刷新的问题
```

### 提交频率

- 一个提交只做一件事：一个功能、一个修复、一个重构
- 建议每完成 TODO.md 中的一个 checkbox 或子任务就提交一次
- 所有提交在推送到远程前确保 `npm run build` 通过
- API 服务与前端在同一个仓库，跨模块的改动如果关联紧密可以合入一个提交

## 当前重构后的协作边界

- 前端业务功能优先放在 `src/features/<feature>/`，路由文件只保留 `createFileRoute` 和页面壳组件。
- 前端共享请求逻辑放在 `src/shared/api/`；`src/lib/api-client.ts` 仅作为兼容门面，不再承载新业务逻辑。
- 后端真实业务入口放在 `api-server/src/modules/<module>/`，旧 `api-server/src/routes/*.ts` 只做兼容导出。
- 后端模块按 `*.routes.ts`、`*.schemas.ts`、`*.service.ts`、`*.repository.ts` 拆分；多人协作时优先改对应模块文件，避免集中修改路由。
- AI 模型选择、用户设置读取和 API Key 解密统一在 `api-server/src/modules/model-providers/`。
- 数据库字段固定使用 `job_description`，前端/API 字段固定使用 `jobDescription`，UI 文案固定使用“岗位需求描述”。
- API 服务只从仓库根目录 `.env` 加载环境变量，不在 `api-server/` 下新增业务 `.env`。
