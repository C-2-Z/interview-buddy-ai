# EZMock 架构设计文档

> 项目名称: AI 面试模拟器（EZMock / A5 AI 面试模拟官）
> 版本: v1.0
> 更新时间: 2026-07-11

---

## 1. 系统架构总览

EZMock 采用前后端分离架构，前端为 TanStack React Start SSR 应用，后端为独立的 Hono API 服务，数据库使用 Supabase PostgreSQL。

`
+--------------------+       +-------------------+       +------------------+
|   Browser (SSR)   | ----> |  Hono API Server  | ----> |  Supabase (PG)   |
|  localhost:3000   |       |  localhost:3001   |       |  Cloud Hosted    |
+--------------------+       +-------------------+       +------------------+
        |                            |
        v                            v
  TanStack React              DeepSeek / OpenAI
  + Tailwind/shadcn           / Anthropic API
  + React Query               + Qwen ASR/TTS
+--------------------+       +-------------------+
`

### 1.1 设计原则

- 功能即模块（Feature as Module）：每个新功能必须是一个独立的模块
- 四层分离（后端）：routes -> service -> repository -> schemas
- 四件套（前端）：api.ts + types.ts + hooks/ + components/
- 路由文件保持薄入口，业务组件全部 import 自 features/

---

## 2. 技术栈详情

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 前端框架 | TanStack React Start | React 19 | SSR + 文件路由 |
| 前端路由 | TanStack Router | - | 自动生成 routeTree.gen.ts |
| 数据获取 | TanStack React Query | 5.x | 服务端状态管理 |
| 样式 | Tailwind CSS | 4.x | 原子化 CSS |
| UI 组件 | shadcn/ui | Radix 原语 | 无障碍基础组件 |
| 构建工具 | Vite + Rolldown | - | 前端构建 |
| API 框架 | Hono | - | 轻量 Node.js HTTP 框架 |
| 数据库 | Supabase PostgreSQL | - | 云端托管 |
| 认证 | Supabase Auth | - | 邮箱/密码 |
| AI Provider | DeepSeek / OpenAI / Anthropic | - | 多模型可切换 |
| 语音 | Qwen ASR + Qwen TTS | - | 阿里通义语音服务 |
| 加密 | AES-256-GCM | - | 用户 API Key 加密存储 |
| 运行时 | Node.js + tsx/watch | - | API 服务运行 |

---

## 3. 前端架构

### 3.1 目录结构

`
src/
  routes/           # 文件路由（TanStack Router 自动发现）
    __root.tsx      # 根布局
    index.tsx       # 着陆页 /
    auth.tsx        # 认证页 /auth
    _authenticated/ # 需认证的路由组
      route.tsx     # 认证布局（AppShell + 鉴权守卫）
      dashboard.tsx # 仪表盘
      new.tsx       # 创建面试
      session..tsx  # 面试会话
      history.tsx   # 历史记录
      interviews/   # 面试详情 + 报告
      settings.tsx  # 设置页
      bank/         # 题库
      resumes/      # 简历库
      voice/        # 语音面试

  features/         # 功能模块（每个独立目录）
    app-shell/      # 应用外壳（侧边栏 + 导航）
    interview-create/   # 创建面试表单
    interview-setup/    # 面试设置
    interview-session/  # 面试会话核心
    interview-hub/      # 面试中心
    interview-history/  # 历史记录 + 报告
    question-bank/      # 公共题库
    resume-library/     # 简历库
    settings/           # 设置面板
    voice-interview/    # 语音面试面板

  components/ui/    # shadcn/ui 基础组件
  lib/              # 通用工具（api-client, hooks）
  shared/           # 跨端共享类型
  styles.css        # 全局样式 + 设计 Token
`

### 3.2 认证守卫架构

TanStack Router 的路由分组实现认证保护：
- _authenticated 路由组包裹在 requireAuth 守卫中
- 未认证用户自动重定向到 /auth
- 路由级懒加载优化首屏性能
- Supabase Auth session 通过 React Query 缓存管理

### 3.3 API 客户端层

- src/lib/api-client.ts 封装 Hono API 调用
- 使用 TanStack React Query 管理缓存和加载状态
- Vite 开发代理将 /api 转发到 localhost:3001

---

## 4. 后端架构

### 4.1 目录结构

`
api-server/src/
  app.ts            # Hono 应用入口，注册所有模块路由
  index.ts          # 服务启动入口
  preload.ts        # 环境变量预加载
  serve.ts          # 生产模式 Serve

  config/           # 全局配置
    cors.ts         # CORS 配置
    env.ts          # 环境变量读取

  middleware/       # 中间件
    auth.ts         # Supabase JWT 验证

  lib/              # 共享工具库
    ai-gateway.ts   # AI Provider 统一网关
    encryption.ts   # AES-256-GCM 加解密
    prompts.ts      # Prompt 模板重导出
    resume-parser.ts # PDF/DOCX 简历解析
    resume-analyzer.ts # 简历分析
    supabase.ts     # Supabase 客户端
    skills/         # Skill 出题引擎

  modules/          # 功能模块（路由 - 服务 - 仓库 - 校验）
    sessions/       # 面试会话管理
    questions/      # 题目对话与评分
    bank/           # 公共题库
    skills/         # Skill 管理
    resumes/        # 简历管理
    settings/       # 用户设置 + API Key
    voice/          # 语音面试
    cleanup/        # 过期会话清理
    model-providers/ # AI Provider 路由

  shared/           # 跨模块共享代码
    ai/             # AI 调用客户端 + JSON 解析器
    auth/           # 认证中间件
    db/             # 数据库客户端

  routes/           # 旧路由兼容导出层
`

### 4.2 模块四层架构

每个后端模块严格遵循四层分离：

`
*.routes.ts      # 路由注册（HTTP 端点 + 参数校验）
     |
     v
*.service.ts     # 业务逻辑（编排 + 调用 AI + 事务）
     |
     v
*.repository.ts  # 数据库访问（SQL / Supabase SDK）
     |
     v
*.schemas.ts     # 输入校验（Zod 定义）
`

---

## 5. AI 集成架构

`
+-------------------+
| AI Gateway        |
| (ai-gateway.ts)   |
+-------------------+
     |
     +-----> DeepSeek (v3/r1)
     +-----> OpenAI (GPT-4o-mini)
     +-----> Anthropic (Claude 3)
     +-----> Qwen ASR/TTS

+----------------------+
| Prompt Templates     |
| (prompt-builders.ts) |
+----------------------+
     |
     +-----> 系统 Prompt（面试官角色）
     +-----> 追问策略（难度递进）
     +-----> 评分 Prompt（多维度）
     +-----> 出题 Prompt（Skill 驱动）
     +-----> 总结 Prompt（报告生成）
`

### 5.1 AI 禁飞区

根据课程要求，以下 3 个核心功能必须手写：

| 禁飞区 | 实现位置 | 说明 |
|--------|----------|------|
| 面试问题生成的难度递进策略 | prompt-builders.ts | 手写 Prompt 策略，定义追问递进层次 |
| 评分的多维度加权计算 | evaluation/evaluation.service.ts | aggregateDimensions() 手写加权平均计算（维度定义+权重+公式）|
| 弱项分析的聚合逻辑 | evaluation/evaluation.service.ts | identifyWeaknesses() 手写排序+阈值(>=70/<70)判定，按维度自动分析优劣势 |

---

## 6. 数据流

### 6.1 面试核心流程

`
用户操作           前端               API                 AI
  |                 |                 |                  |
  1. 创建面试 --+---> /new -----------> POST /sessions --+--> AI 出题
                 |                   |                  |
  2. 回答题目 --+---> /session/:id ---> POST /questions --+--> AI 追问
                 |                   |                  |
  3. 完成面试 --+---> 自动结束 -------> POST /:id/finish -+--> AI 评分
                 |                   |                  |
  4. 查看报告 --+---> /interviews/:id -> GET /sessions/:id
`

### 6.2 语音面试流程

`
用户 (浏览器)          前端面板           API WebSocket         Qwen 服务
   |                    |                 |                    |
   1. 按住录音 ---------> MediaStream ---> WSS connect -------> ASR
   |                    |                 | <--- text --------- |
   2. AI 回复 ---------- <--- text ------- <--- AI response
   |                    |                 |
   3. TTS 播放 <-------- <--- audio ------ <--- WSS ------------> TTS
`

---

## 7. 部署架构

| 组件 | 平台 | 说明 |
|------|------|------|
| Web 前端 | Vercel | Nitro SSR 部署 |
| API 服务 | Railway / Render / Fly.io | Node.js Hono 应用 |
| 数据库 | Supabase Cloud | PostgreSQL + Auth |
| AI API | 各 Provider | DeepSeek/OpenAI/Anthropic/Qwen |

---

## 8. 安全设计

- Supabase JWT 用于 API 请求认证
- 用户 API Key 通过 AES-256-GCM 加密后存储
- Row Level Security (RLS) 确保用户只能访问自己的数据
- 语音 WebSocket 连接使用 Token 鉴权
- 环境变量用于服务端密钥管理
