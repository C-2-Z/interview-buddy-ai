# AI 面试模拟器 — AGENTS.md

## 项目概述

AI 驱动的面试练习平台。用户选择岗位和难度，AI 出题、进行多轮对话面试、逐题评分并生成综合报告。
支持多模型切换（DeepSeek / OpenAI / Anthropic）、Skill 驱动出题、公共题库刷题、用户 API Key 加密存储。

## 技术栈

### 前端
- **框架**: TanStack React Start (SSR, React 19)
- **路由**: TanStack Router (文件路由，自动生成 routeTree.gen.ts)
- **数据获取**: TanStack React Query 5
- **样式**: Tailwind CSS 4 + shadcn/ui (Radix UI 原语)
- **构建**: Vite + Rolldown

### 后端
- **API 框架**: Hono
- **运行时**: Node.js (tsx/watch)
- **AI Provider**: DeepSeek Chat / OpenAI / Anthropic（多模型可切换）
- **AI 技能**: 按岗位预定义的 Skill JSON 配置出题风格与知识点

### 数据库 & 认证
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth (邮箱/密码)
- **存储**: 用户设置中的 API Key 通过 AES-256-GCM 加密存储

### 部署
- **Web 前端**: Vercel (Nitro SSR)
- **API 服务**: Railway / Render / Fly.io 等 Node.js 平台
- **App 容器**: Capacitor (Android/iOS) / Tauri (Windows)

## 核心架构：功能即模块

每个新功能必须是一个**独立的模块**，禁止将多功能的逻辑混入同一个文件。

```
后端新增功能 → 在 api-server/src/modules/<feature>/ 下新建完整模块
   ├── <feature>.routes.ts      # 路由注册
   ├── <feature>.service.ts     # 业务流程
   ├── <feature>.repository.ts  # 数据库访问
   ├── <feature>.schemas.ts     # 输入校验 (Zod)
   └── <feature>.types.ts       # (可选) 类型定义

前端新增功能 → 在 src/features/<feature>/ 下新建完整特性目录
   ├── api.ts                   # API 调用函数
   ├── types.ts                 # TypeScript 类型
   ├── constants.ts             # (可选) 常量
   ├── hooks/                   # React Hooks
   │   └── use-<feature>.ts
   └── components/              # UI 组件
       └── <feature>-*.tsx
   └── ...其他模块按需
```

### 具体约束

1. **后端模块必须拆分** — 每个模块下至少 `*.routes.ts` + `*.service.ts` + `*.repository.ts` + `*.schemas.ts`，四层分离。
2. **前端 feature 目录必须独立** — 不允许在已有的 feature 目录里塞另一个功能域的代码。
3. **路由文件保持薄入口** — `src/routes/*.tsx` 只做 `createFileRoute` + 页面壳组件，业务组件全部 import 自 `features/`。
4. **兼容导出** — 旧 `api-server/src/routes/*.ts` 只做 `export { ... } from "../modules/.../..."`，不写新逻辑。
5. **新增路由必须注册到 app.ts** — 在 `api-server/src/app.ts` 中挂载新模块路由。
6. **新增前端页面必须注册到 routeTree** — 在 `src/routes/` 下新增文件，运行 `npm run dev` 自动生成 routeTree.gen.ts。


## 日志约定

项目使用 **consola** 库作为统一日志方案，禁止使用手写 `console.log` / `console.error`。

### 规则

1. **创建带 tag 的 logger** — 每个模块/功能通过 `createModuleLogger(tag)` 创建自己的实例：
   ```typescript
   import { createModuleLogger } from "../voice/voice-logger.js";
   const logger = createModuleLogger("my-module");
   ```

2. **使用日志级别** — consola 自动提供 `info` / `warn` / `error` / `debug` / `success` 等各级别输出，禁止裸 `console.*`。

3. **错误日志带 Error 对象** — `logger.error(error, meta)`，第一个参数传 `Error` 实例。

4. **敏感信息自动脱敏** — `voice-logger.ts` 内置脱敏 reporter，自动过滤 `key`/`token`/`authorization`/`secret` 等字段。


## 数据命名约定

| 位置 | 命名 |
|------|------|
| 数据库字段 | `job_description` |
| 前端/API 请求体 | `jobDescription` |
| UI 文案 | "岗位需求描述" |

## 本地开发

```bash
# 安装依赖
npm install
cd api-server && npm install && cd ..

# 启动开发（两个终端）
npm run dev          # 前端 (localhost:3000)
npm run api:dev      # API 服务 (localhost:3001)

# 或一键启动
.\AI面试官助手.ps1

# 构建验证
npm run build
cd api-server && npm run build
```

## 开发约定

### 新增功能规范（必须遵守）

```
1. 后端新增功能 → api-server/src/modules/<feature>/ 新建完整模块
   每个模块至少包含: *.routes.ts + *.service.ts + *.repository.ts + *.schemas.ts

2. 前端新增功能 → src/features/<feature>/ 新建完整目录
   每个 feature 至少包含: api.ts + types.ts + hooks/ + components/

3. 在 api-server/src/app.ts 中注册新路由

4. 在 src/routes/ 下新增路由文件（薄入口，业务逻辑 import 自 features/）

5. 严禁将新功能的代码塞进已有的模块/feature 目录
```

### 通用约定

- 新增路由文件后运行 `npm run dev` 自动生成 `routeTree.gen.ts`
- 路由文件只保留 `createFileRoute` 和页面壳组件，业务组件放 `features/`
- 使用 `@/` 别名引用 `src/` 下的模块
- 环境变量前缀 `VITE_` 暴露给客户端，纯服务端变量不用前缀
- API 服务通过 `preload.ts` 从仓库根目录 `.env` 加载

## Git 提交规范

本项目采用 **Conventional Commits + 中文描述** 的提交格式：

```
<type>(<scope>): <中文描述>

说明文字（按需，解释"为什么"而非"做了什么"）
```

### 类型 (type)

| 类型 | 场景 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 新增限时模式倒计时功能` |
| `fix` | Bug 修复 | `fix: 修复评分计算精度溢出问题` |
| `refactor` | 代码重构 | `refactor(api-server): 抽离 AI 评分逻辑为独立服务` |
| `docs` | 文档变更 | `docs: 更新部署流程与环境变量说明` |
| `db` | 数据库迁移 | `db: 新增 interview_messages 表` |
| `config` | 配置文件变更 | `config: 新增 Dockerfile 部署配置` |

### 原则

- 第一行不超过 72 字，中文描述，过去时动词（新增/修复/重构）
- 一个提交只做一件事
- 建议每完成 TODO.md 中的一个 checkbox 就提交一次
- 推送到远程前确保 `npm run build` 通过
- 关联 TODO 编号时在说明中标注，例如 `Phase 2 / A2`
