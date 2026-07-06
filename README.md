# AI 面试模拟器

基于 AI 的面试练习平台，帮助你通过模拟面试提升面试技巧。选择岗位与难度，AI 会为你生成定制面试题，逐题评分并给出可执行的改进建议。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | TanStack React Start (SSR) |
| 路由 | TanStack Router (文件路由) |
| 状态 | TanStack React Query |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 表单验证 | Zod |
| 数据库 | Supabase (PostgreSQL + RLS) |
| 认证 | Supabase Auth (邮箱/密码) |
| AI | DeepSeek Chat (OpenAI 兼容 API) |
| 部署 | Vercel (SSR) |

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

\`\`\`bash
npm install
\`\`\`

### 2. 配置环境变量

复制 \`.env.example\` 为 \`.env\`，然后填入你的 Supabase 和 DeepSeek 凭据：

\`\`\`env
# Supabase
SUPABASE_PROJECT_ID="your_project_id"
SUPABASE_PUBLISHABLE_KEY="your_publishable_key"
SUPABASE_URL="your_supabase_url"
VITE_SUPABASE_PROJECT_ID="your_project_id"
VITE_SUPABASE_PUBLISHABLE_KEY="your_publishable_key"
VITE_SUPABASE_URL="your_supabase_url"

# DeepSeek
DEEPSEEK_API_KEY="sk-your_deepseek_api_key"
\`\`\`

### 3. 初始化数据库

在 Supabase SQL Editor 中依次执行以下迁移文件：

1. \`supabase/migrations/20260705032824_8a24ce9f-cfd4-4534-8b7b-fd242ff33ea9.sql\` — 建表（profiles、interview_sessions、interview_questions）
2. \`supabase/migrations/20260705032837_3f7fb1ce-e03d-4998-9026-44cc485a195b.sql\` — 权限调整
3. \`supabase/migrations/20260705045401_add_interview_messages.sql\` — 多轮对话表

### 4. 启动开发服务器

\`\`\`bash
npm run dev
\`\`\`

访问 \`http://localhost:3000\` 即可使用。

### 5. 构建与部署

\`\`\`bash
npm run build      # 构建
npm run preview    # 本地预览构建产物
\`\`\`

项目已配置 \`vercel.json\`，可直接部署到 Vercel。

## 项目结构

\`\`\`
src/
├── components/ui/        # shadcn/ui 组件
├── hooks/                # 自定义 hooks
├── integrations/
│   └── supabase/         # Supabase 客户端与中间件
├── lib/
│   ├── ai-gateway.server.ts   # DeepSeek API 封装
│   ├── interview.functions.ts # 核心业务逻辑（server functions）
│   └── error-capture.ts       # 服务端错误捕获
├── routes/               # TanStack Router 文件路由
│   ├── __root.tsx        # 根布局
│   ├── index.tsx         # 着陆页
│   ├── auth.tsx          # 登录/注册
│   └── _authenticated/   # 需认证的路由
│       ├── route.tsx     # 认证后布局
│       ├── dashboard.tsx # 仪表盘
│       ├── new.tsx       # 创建新面试
│       ├── history.tsx   # 历史记录
│       └── session.\$id.tsx  # 面试会话页
├── router.tsx            # 路由配置
├── server.ts             # 服务端入口（错误处理）
├── start.ts              # TanStack Start 实例化
└── styles.css            # Tailwind 全局样式
\`\`\`

## 核心流程

\`\`\`
用户选择岗位/难度 → AI 生成面试题 → 逐题多轮对话 → 结束对话并评分
    → 所有题完成后 → AI 生成综合反馈 → 历史可随时回顾
\`\`\`

每个环节通过 \`@tanstack/react-start\` 的 \`createServerFn\` 与后端安全交互，认证通过 Supabase RLS 策略保障数据隔离。

## 许可证

MIT
