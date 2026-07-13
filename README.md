# AI 面试模拟器

基于 AI 的面试练习平台。用户选择岗位、难度和岗位需求描述后，系统生成定制题目，并支持逐题多轮追问、评分、综合反馈、题库练习、Skill 驱动出题和多模型配置。

## 技术栈

| 层           | 技术                                            |
| ------------ | ----------------------------------------------- |
| 前端         | TanStack React Start, React 19, TanStack Router |
| UI           | Tailwind CSS 4, shadcn/ui, Radix UI             |
| 后端 API     | Hono                                            |
| 数据库与认证 | Supabase PostgreSQL, RLS, Supabase Auth         |
| AI           | DeepSeek / OpenAI / Anthropic 兼容模型          |
| 构建         | Vite + Rolldown                                 |

## 项目结构

```
interview-buddy-ai/
├── src/                              # 前端 (TanStack React Start SSR)
│   ├── app/                          # App 级入口封装
│   │   ├── router.tsx                # TanStack Router 配置
│   │   └── start.ts                  # TanStack Start 实例化
│   ├── features/                     # 前端功能模块（核心业务逻辑在这里）
│   │   ├── auth-session/             #   认证守卫与认证布局
│   │   ├── interview-hub/            #   文本 / 语音双入口首页
│   │   ├── interview-agent/          #   文本面试创建与会话
│   │   ├── immersive-voice-interview/#   沉浸式语音面试
│   │   ├── question-bank/            #   题库
│   │   └── settings/                 #   用户设置
│   ├── shared/                       # 前端共享基础设施
│   │   └── api/
│   │       ├── http-client.ts        #   通用 HTTP 客户端
│   │       └── auth-token.ts         #   token 获取
│   ├── components/ui/                # shadcn/ui 组件（54 个）
│   ├── hooks/                        # 全局自定义 hooks
│   ├── integrations/supabase/        # Supabase 客户端与中间件
│   ├── lib/                          # 兼容门面 + 工具库
│   │   ├── api-client.ts             # 旧 API 客户端兼容门面（新代码勿用）
│   │   ├── ai-gateway.server.ts      # 保留给 SSR 使用
│   │   ├── error-capture.ts          # 服务端错误捕获
│   │   └── error-page.ts             # 友好错误页面 HTML
│   ├── routes/                       # TanStack Router 文件路由（薄入口）
│   │   ├── __root.tsx                #    根布局
│   │   ├── index.tsx                 #    着陆页
│   │   ├── auth.tsx                  #    登录/注册
│   │   ├── _authenticated/           #    需认证且带应用导航的路由
│   │       ├── route.tsx             #      认证后布局
│   │       ├── dashboard.tsx         #      仪表盘
│   │       ├── new.tsx               #      创建新面试
│   │       ├── history.tsx           #      历史记录
│   │       ├── session.$id.tsx       #      面试会话
│   │       ├── bank/                 #      题库
│   │       │   ├── index.tsx
│   │       │   └── $id.tsx
│   │       └── settings.tsx          #      用户设置
│   │   └── _focus/                   #    需认证且无应用导航的专注路由
│   │       ├── interview-hub.tsx     #      双入口首页
│   │       ├── voice.new.tsx         #      语音面试准备厅
│   │       └── voice.session.$id.tsx #      沉浸式语音面试间
│   ├── router.tsx                    # (deprecated) 旧路由配置
│   ├── server.ts                     # SSR 服务端入口
│   ├── start.ts                      # (deprecated) 旧 start 封装
│   ├── styles.css                    # Tailwind 全局样式
│   └── routeTree.gen.ts              # 自动生成
│
├── api-server/                       # 独立后端 API 服务 (Hono)
│   └── src/
│       ├── index.ts                  #    启动入口
│       ├── serve.ts                  #    Node.js 服务器
│       ├── app.ts                    #    Hono app 装配（路由挂载）
│       ├── preload.ts                #    环境变量预加载
│       ├── config/                   #    配置
│       │   ├── cors.ts               #      CORS
│       │   └── env.ts                #      环境变量读取
│       ├── middleware/               #    全局中间件
│       │   └── auth.ts               #      旧版 auth 中间件（兼容）
│       ├── routes/                   #    **兼容导出层，不写新逻辑**
│       │   ├── sessions.ts           #      → modules/sessions/sessions.routes
│       │   └── questions.ts          #      → modules/questions/questions.routes
│       ├── modules/                  #    **业务模块目录（新代码写在这里）**
│       │   ├── sessions/             #      面试会话
│       │   ├── questions/            #      对话消息与评分
│       │   ├── skills/               #      Skill 配置加载与分配
│       │   ├── bank/                 #      公共题库
│       │   ├── settings/             #      用户设置（加密 API Key）
│       │   └── model-providers/      #      AI 模型供应商抽象层
│       ├── shared/                   #    共享基础设施
│       │   ├── ai/                   #      AI 客户端抽象
│       │   │   ├── ai-client.ts     #        AI 调用统一入口
│       │   │   ├── json-parser.ts   #        JSON 提取
│       │   │   └── providers.ts     #        多供应商实现
│       │   ├── auth/                 #      认证
│       │   │   └── require-auth.ts   #        Hono auth 中间件
│       │   └── db/                   #      数据库
│       │       └── supabase.ts       #        Supabase 客户端工厂
│       └── lib/                      #    工具库
│           ├── ai-gateway.ts         #      旧 AI 网关（兼容）
│           ├── encryption.ts         #      加密工具
│           ├── prompts.ts            #      Prompt 模板
│           ├── skills/               #      Skill 定义
│           └── supabase-types.ts     #      数据库类型
│
├── supabase/migrations/              # 数据库迁移脚本
├── scripts/                          # 工具脚本
├── .env                              # 根目录环境变量
├── vite.config.ts                    # Vite 配置
├── vercel.json                       # Vercel 部署配置
└── AI面试官助手.ps1                   # 一键启动脚本
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

## 前后端架构

```
[浏览器]
  ├─ src/features/*/api.ts ──→ shared/api/http-client.ts
  │                               │
  │                      Authorization: Bearer <token>
  │                               │
  │                         Vite 代理 (开发)
  │                      / 直接 API (生产)
  ▼                               ▼
Hono API 服务 (api-server/)
  ├─ modules/*/*.routes.ts ──→ modules/*/*.service.ts ──→ modules/*/*.repository.ts
  │                                                                 │
  └─ shared/ai/ai-client.ts ──→ DeepSeek / OpenAI / Anthropic       │
                                    │                          Supabase
                               API Key (用户自定义或默认密钥)     (RLS)
```

- **开发环境**: Vite 开发服务器自动代理 `/api/*` 到 `localhost:3001`
- **生产环境**: 通过 `VITE_API_URL` 环境变量指定 API 服务地址
- **认证**: 客户端自动从 Supabase session 获取 access_token，附加到请求头
- **AI 供应商**: 用户可在设置页选择模型供应商并配置自有 API Key（加密存储）

## 路由表

| 路径               | 前端文件                                | 后端模块                                        | 认证 | 说明                     |
| ------------------ | --------------------------------------- | ----------------------------------------------- | ---- | ------------------------ |
| /                  | routes/index.tsx                        | —                                               | 否   | 着陆页                   |
| /auth              | routes/auth.tsx                         | —                                               | 否   | 登录 / 注册              |
| /interview-hub     | routes/\_focus/interview-hub.tsx        | modules/agent-readiness/                        | 是   | 文本 / 语音双入口首页    |
| /voice/new         | routes/\_focus/voice.new.tsx            | modules/interview-agent/                        | 是   | 语音面试准备与设备校准   |
| /voice/session/$id | routes/\_focus/voice.session.\$id.tsx   | modules/voice/ +<br>modules/interview-agent/    | 是   | 沉浸式语音面试           |
| /dashboard         | routes/\_authenticated/dashboard.tsx    | —                                               | 是   | 仪表盘                   |
| /new               | routes/\_authenticated/new.tsx          | modules/sessions/                               | 是   | 创建新面试               |
| /history           | routes/\_authenticated/history.tsx      | modules/sessions/                               | 是   | 历史记录                 |
| /session/$id       | routes/\_authenticated/session.\$id.tsx | modules/interview-agent/                        | 是   | 文本面试与统一报告       |
| /bank              | routes/\_authenticated/bank/index.tsx   | modules/bank/                                   | 是   | 题库列表                 |
| /bank/$id          | routes/\_authenticated/bank/\$id.tsx    | modules/bank/                                   | 是   | 题库题目详情             |
| /settings          | routes/\_authenticated/settings.tsx     | modules/settings/ +<br>modules/model-providers/ | 是   | 用户设置（模型/API Key） |

## API 端点

| 方法  | 路径                        | 说明                         | 认证         |
| ----- | --------------------------- | ---------------------------- | ------------ |
| POST  | /api/sessions               | 创建面试 + AI 出题           | Bearer Token |
| GET   | /api/sessions               | 列出所有面试                 | Bearer Token |
| GET   | /api/sessions/:id           | 获取面试详情 + 题目          | Bearer Token |
| POST  | /api/sessions/:id/finish    | 完成面试并生成总结           | Bearer Token |
| POST  | /api/questions/:id/message  | 发送对话消息                 | Bearer Token |
| POST  | /api/questions/:id/evaluate | 评价对话并评分               | Bearer Token |
| GET   | /api/bank                   | 题库列表                     | Bearer Token |
| GET   | /api/settings               | 获取用户设置（含 AI 供应商） | Bearer Token |
| PATCH | /api/settings               | 更新用户设置（加密 API Key） | Bearer Token |
| GET   | /api/skills                 | Skill 列表                   | Bearer Token |
| GET   | /api/health                 | 健康检查                     | 无           |

## 关键架构模式

### 1. 后端模块四层结构

每个模块由四个文件组成，职责严格分离：

| 层   | 文件                   | 职责                                                 |
| ---- | ---------------------- | ---------------------------------------------------- |
| 路由 | `<name>.routes.ts`     | 认证校验、请求体解析（Zod）、调用 service、返回 JSON |
| 业务 | `<name>.service.ts`    | 业务流程编排、AI 调用、组合 repository 查询          |
| 数据 | `<name>.repository.ts` | 数据库查询（通过 Supabase client）                   |
| 校验 | `<name>.schemas.ts`    | Zod schema 定义，校验请求体                          |

### 2. 前端 feature 目录结构

每个前端功能模块包含：

| 文件          | 职责                                             |
| ------------- | ------------------------------------------------ |
| `api.ts`      | API 调用函数（通过 `shared/api/http-client.ts`） |
| `types.ts`    | 功能域专属类型定义                               |
| `hooks/`      | React Hooks（状态管理 + API 调用封装）           |
| `components/` | UI 组件                                          |

### 3. AI 多模型架构

AI 调用走统一入口，供应商逻辑在 `shared/ai/` 中隔离：

```
modules/*/service.ts
  └─→ callAI(messages, userSettings?)
        └─→ shared/ai/providers.ts  (按用户选择路由)
              ├─→ providerDeepSeek()
              ├─→ providerOpenAI()
              └─→ providerAnthropic()
```

用户设置的 API Key 通过 `modules/settings/` 读取，经过 `modules/settings/encryption.service.ts` 解密后传入 provider。

### 4. Skill 驱动出题

`modules/skills/` 管理岗位技能定义：

- `skill.json` — 技能元数据（名称、知识点列表、技术标签）
- `persona.md` — AI 面试官角色设定 Prompt
- `lib/skills/_shared/references/` — 各知识点参考资料

出题时 `modules/sessions/question-generation.service.ts` 读取对应 Skill 配置，生成贴合岗位的题目。已回答过的题目在 `sessions.repository.ts` 中去重。

### 5. 认证体系

两层认证机制：

1. **客户端**: `auth-attacher.ts` 自动从 Supabase session 提取 access_token 附加到请求头
2. **API 服务**: `shared/auth/require-auth.ts` 校验 Bearer token，解析 claims，创建认证 Supabase 客户端

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
cd api-server && npm run worker:dev  # 渐进出题 BullMQ Worker
```

启用渐进生成前需要执行最新 Supabase migration，并配置同区域原生
Redis/Valkey TCP 地址 `REDIS_URL`。生产环境必须同时运行 API 进程和
`npm run worker:start`；未配置 Redis 时自动保留原同步出题流程。

构建验证：

```bash
npm run build
cd api-server && npm run build
```

## API

| 方法 | 路径                                  | 说明                   |
| ---- | ------------------------------------- | ---------------------- |
| POST | `/api/sessions`                       | 创建面试并生成题目     |
| GET  | `/api/sessions`                       | 列出面试记录           |
| GET  | `/api/sessions/:id`                   | 获取面试详情和题目     |
| POST | `/api/sessions/:id/finish`            | 完成面试并生成总结     |
| GET  | `/api/sessions/:id/generation`        | 获取渐进生成状态       |
| GET  | `/api/sessions/:id/generation/events` | 订阅题目生成 SSE 事件  |
| POST | `/api/sessions/:id/generation/retry`  | 重试未完成的生成任务   |
| POST | `/api/questions/:id/message`          | 发送回答并获取 AI 追问 |
| POST | `/api/questions/:id/evaluate`         | 手动结束对话并评分     |
| GET  | `/api/bank`                           | 题库列表               |
| GET  | `/api/settings`                       | 用户模型设置           |
| GET  | `/api/skills`                         | Skill 元数据           |
