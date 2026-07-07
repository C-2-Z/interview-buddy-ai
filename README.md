# AI 面试模拟器

基于 AI 的面试练习平台，帮助你通过模拟面试提升面试技巧。选择岗位与难度，AI 会为你生成定制面试题，逐题评分并给出可执行的改进建议。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端框架 | TanStack React Start (SSR) |
| 路由 | TanStack Router (文件路由) |
| 状态管理 | TanStack React Query |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 表单验证 | Zod |
| API 服务 | Hono (独立后端) |
| 数据库 | Supabase (PostgreSQL + RLS) |
| 认证 | Supabase Auth (邮箱/密码) |
| AI | DeepSeek Chat (OpenAI 兼容 API) |
| Web 部署 | Vercel (SSR) |
| API 部署 | Railway / Render / Fly.io |
| App 容器 | Capacitor (移动端) / Tauri (桌面端) |

## 功能

- **定制出题** — 根据岗位、难度和你填写的个人背景，AI 生成贴合实际的面试题
- **多轮对话** — 与 AI 面试官逐题进行自然对话，回答后可被追问或引导深入
- **逐题评分** — AI 对每道题独立评分（1-100），并给出优缺点与改进建议
- **综合报告** — 面试完成后生成整体评分与总结性反馈
- **历史记录** — 所有历史面试自动保存，方便复盘与追踪进步

## 快速开始

### 前置要求

- Node.js 20+
- npm
- Supabase 项目（免费套餐即可）
- DeepSeek API Key（[申请地址](https://platform.deepseek.com/api_keys)）

### 1. 安装依赖

```bash
# 前端依赖
npm install

# API 服务依赖
cd api-server && npm install && cd ..
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，然后填入你的 Supabase 和 DeepSeek 凭据：

```env
# Supabase
SUPABASE_PROJECT_ID="your_project_id"
SUPABASE_PUBLISHABLE_KEY="your_publishable_key"
SUPABASE_URL="your_supabase_url"
VITE_SUPABASE_PROJECT_ID="your_project_id"
VITE_SUPABASE_PUBLISHABLE_KEY="your_publishable_key"
VITE_SUPABASE_URL="your_supabase_url"

# API 地址（开发环境默认使用 Vite 代理，可不填）
VITE_API_URL=""

# DeepSeek
DEEPSEEK_API_KEY="sk-your_deepseek_api_key"
```

API 服务专用环境变量（`api-server/.env`）：

```env
SUPABASE_URL="your_supabase_url"
SUPABASE_PUBLISHABLE_KEY="your_publishable_key"
DEEPSEEK_API_KEY="sk-your_deepseek_api_key"
PORT=3001
```

### 3. 初始化数据库

在 Supabase SQL Editor 中依次执行以下迁移文件：

1. `supabase/migrations/20260705032824_8a24ce9f-cfd4-4534-8b7b-fd242ff33ea9.sql` — 建表（profiles、interview_sessions、interview_questions）
2. `supabase/migrations/20260705032837_3f7fb1ce-e03d-4998-9026-44cc485a195b.sql` — 权限调整
3. `supabase/migrations/20260705045401_add_interview_messages.sql` — 多轮对话表

### 4. 启动开发服务器

需要同时启动前端和 API 服务。有两种方式：

**方式一：两个终端（推荐）**

```bash
# 终端 1：启动 API 服务
cd api-server && npm run dev
# → http://localhost:3001

# 终端 2：启动前端
npm run dev
# → http://localhost:3000
```

**方式二：一键启动脚本**

双击 `AI面试官助手.ps1` 自动启动两个服务并打开浏览器。

**方式三：使用脚本命令**

```bash
npm run dev:all    # 同时启动两个服务（需要先安装 concurrently）
```

前端开发服务器自动将 `/api/*` 请求代理到 API 服务（配置见 `vite.config.ts`），开发时跨域等问题完全无感。

### 5. 验证

```bash
# 检查 API 服务是否正常运行
curl http://localhost:3001/api/health
# 返回：{"status":"ok"}

# 打开浏览器访问前端
# http://localhost:3000
```

### 6. 构建

```bash
# 构建前端
npm run build
```

## 项目结构

```
interview-buddy-ai/
├── src/                          # 前端 (TanStack React Start SSR)
│   ├── components/ui/            # shadcn/ui 组件
│   ├── hooks/                    # 自定义 hooks
│   ├── integrations/supabase/    # Supabase 客户端与中间件
│   ├── lib/
│   │   ├── api-client.ts         # API 客户端（替代 server functions）
│   │   ├── ai-gateway.server.ts  # DeepSeek API 封装（保留给 SSR 使用）
│   │   └── error-capture.ts      # 服务端错误捕获
│   ├── routes/                   # TanStack Router 文件路由
│   │   ├── __root.tsx            # 根布局
│   │   ├── index.tsx             # 着陆页
│   │   ├── auth.tsx              # 登录/注册
│   │   └── _authenticated/       # 需认证的路由
│   │       ├── route.tsx         # 认证后布局
│   │       ├── dashboard.tsx     # 仪表盘
│   │       ├── new.tsx           # 创建新面试
│   │       ├── history.tsx       # 历史记录
│   │       └── session.$id.tsx   # 面试会话页
│   ├── router.tsx                # 路由配置
│   ├── server.ts                 # 服务端入口（错误处理）
│   ├── start.ts                  # TanStack Start 实例化
│   └── styles.css                # Tailwind 全局样式
│
├── api-server/                   # 独立后端 API 服务 (Hono)
│   ├── src/
│   │   ├── index.ts              # Hono 入口
│   │   ├── serve.ts              # Node.js 服务器启动
│   │   ├── middleware/auth.ts    # Supabase JWT 认证中间件
│   │   ├── routes/
│   │   │   ├── sessions.ts       # 面试会话 CRUD
│   │   │   └── questions.ts      # 对话消息与评分
│   │   └── lib/
│   │       ├── ai-gateway.ts     # DeepSeek API 封装
│   │       └── supabase.ts       # 认证 Supabase 客户端工厂
│   ├── package.json
│   └── tsconfig.json
│
├── supabase/migrations/          # 数据库迁移脚本
├── .env.example
├── vite.config.ts                # Vite 配置（含 /api 代理）
├── vercel.json                   # Vercel 部署配置
└── AI面试官助手.ps1               # 一键启动脚本
```

## 核心流程

```
用户选择岗位/难度 -> AI 生成面试题 -> 逐题多轮对话 -> 结束对话并评分
    -> 所有题完成后 -> AI 生成综合反馈 -> 历史可随时回顾

数据流向：
[浏览器] api-client.ts fetch /api/*
    -> Vite 代理（开发）/ 直接请求（生产）
    -> Hono API 服务 -> Supabase + DeepSeek
```

## API 端点

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/sessions | 创建面试 + AI 出题 | Bearer Token |
| GET | /api/sessions | 列出所有面试 | Bearer Token |
| GET | /api/sessions/:id | 获取面试详情 | Bearer Token |
| POST | /api/sessions/:id/finish | 完成面试并生成总结 | Bearer Token |
| POST | /api/questions/:id/message | 发送对话消息 | Bearer Token |
| POST | /api/questions/:id/evaluate | 评价对话并评分 | Bearer Token |
| GET | /api/health | 健康检查 | 无 |

## 架构说明

### 前后端分离

项目已实现前后端分离架构：

- **前端** — TanStack React Start SSR，负责 UI 渲染和交互
- **API 服务** — Hono 框架，独立部署，处理所有业务逻辑

前端通过 `src/lib/api-client.ts` 以 HTTP fetch 方式调用后端 API，替代了原有的 `createServerFn` 机制。

### 开发模式

开发环境下，Vite 配置了 `/api` 代理，前端请求自动转发到 `localhost:3001` 的 API 服务。

### App 打包

后续可通过以下方式打包为原生 App：

- **Android / iOS** — 使用 Capacitor 将 SPA 构建产物包裹为原生应用
- **Windows** — 使用 Tauri 构建轻量桌面应用（<10MB 安装包）

## 部署

### 前端 (Vercel)

保持现有 `vercel.json` 配置，设置环境变量 `VITE_API_URL` 指向生产 API 地址。

### API 服务

可部署到 Railway、Render、Fly.io 等 Node.js 平台，需要设置以下环境变量：

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
DEEPSEEK_API_KEY=
PORT=3001
```

启动命令：`cd api-server && npm run start`

## 许可证

MIT
