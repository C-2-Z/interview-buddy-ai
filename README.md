# AI 面试模拟器

基于 AI 的面试练习平台。用户选择岗位、难度和岗位需求描述后，系统生成定制题目，并支持逐题多轮追问、评分、综合反馈、题库练习、Skill 驱动出题和多模型配置。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | TanStack React Start, React 19, TanStack Router |
| UI | Tailwind CSS 4, shadcn/ui, Radix UI |
| 后端 API | Hono |
| 数据库与认证 | Supabase PostgreSQL, RLS, Supabase Auth |
| AI | DeepSeek / OpenAI / Anthropic 兼容模型 |
| 构建 | Vite + Rolldown |

## 项目结构

```text
interview-buddy-ai/
├── src/
│   ├── app/                    # 前端 app 级入口封装
│   ├── features/               # 前端按功能域拆分
│   │   ├── interview-create/
│   │   ├── interview-session/
│   │   ├── question-bank/
│   │   └── settings/
│   ├── shared/api/             # 前端 HTTP client 与 token 获取
│   ├── integrations/supabase/  # Supabase 浏览器/SSR 客户端与类型
│   └── routes/                 # TanStack Router 薄路由入口
├── api-server/
│   └── src/
│       ├── app.ts              # Hono app 装配
│       ├── config/             # CORS / env
│       ├── shared/             # auth/db/ai 等共享基础设施
│       └── modules/            # 后端按功能域拆分
│           ├── sessions/
│           ├── questions/
│           ├── skills/
│           ├── bank/
│           ├── settings/
│           └── model-providers/
└── supabase/migrations/
```

## 核心架构：功能即模块

> **每个新功能必须是一个独立的模块，禁止在已有文件中堆砌多种功能逻辑。**

### 后端新增功能流程

```bash
# 1. 创建模块目录
mkdir api-server/src/modules/<feature>/
# 2. 创建四层分离文件
touch <feature>.routes.ts   # 路由注册 + Zod 校验
touch <feature>.service.ts   # 业务流程编排
touch <feature>.repository.ts # 数据库访问
touch <feature>.schemas.ts   # 请求体/响应体校验
# 3. 在 app.ts 中挂载
# api-server/src/app.ts → app.route("/api/<feature>", <feature>Routes)
# 4. 在 api-server/src/routes/<feature>.ts 做兼容导出
export { <feature> } from "../modules/<feature>/<feature>.routes.js";
```

### 前端新增功能流程

```bash
# 1. 创建 feature 目录
mkdir src/features/<feature>/
# 2. 创建模块文件
touch api.ts          # API 调用函数
touch types.ts         # TypeScript 类型
mkdir hooks            # React Hooks
mkdir components       # UI 组件
# 3. 在 src/routes/ 下新增路由文件（薄入口，业务组件 import 自 features/）
```

### 约束

- 前端路由文件只挂载页面组件，业务状态、API 调用和 UI 子组件放在 `src/features/<feature>/`。
- 后端 `api-server/src/routes/*.ts` 只保留兼容导出，真实业务入口在 `api-server/src/modules/*/*.routes.ts`。
- 后端路由只做认证上下文、请求校验和 JSON 返回；数据库访问放 repository，业务流程放 service。
- AI provider 选择、用户设置读取和 API Key 解密统一在 `modules/model-providers/`。
- Prompt 只放在对应业务模块的 prompt builder 中，避免散落在路由。
- 数据库字段使用 `job_description`，前端/API 请求字段使用 `jobDescription`，UI 文案使用"岗位需求描述"。

## 环境变量

只在仓库根目录放 `.env`。API 服务通过 `api-server/src/preload.ts` 从根目录加载。

```env
SUPABASE_PROJECT_ID=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PAT=

VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_URL=
VITE_API_URL=

DEEPSEEK_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
ENCRYPTION_KEY=
```

## 本地开发

```bash
npm install
cd api-server && npm install && cd ..
npm run dev          # 前端 (localhost:3000)
npm run api:dev      # API 服务 (localhost:3001)
```

构建验证：

```bash
npm run build
cd api-server && npm run build
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/sessions` | 创建面试并生成题目 |
| GET | `/api/sessions` | 列出面试记录 |
| GET | `/api/sessions/:id` | 获取面试详情和题目 |
| POST | `/api/sessions/:id/finish` | 完成面试并生成总结 |
| POST | `/api/questions/:id/message` | 发送回答并获取 AI 追问 |
| POST | `/api/questions/:id/evaluate` | 手动结束对话并评分 |
| GET | `/api/bank` | 题库列表 |
| GET | `/api/settings` | 用户模型设置 |
| GET | `/api/skills` | Skill 元数据 |
