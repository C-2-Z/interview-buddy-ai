# EZMock 项目架构 (.agent)

## 技术栈
- 前端: TanStack React Start (SSR, React 19) + TanStack Router + Tailwind CSS 4 + shadcn/ui
- 后端: Hono (Node.js/TS) + Supabase (PostgreSQL + Auth)
- AI: DeepSeek / OpenAI / Anthropic（多模型切换）
- 语音: Qwen ASR + Qwen TTS
- 部署: Vercel (前端) + Railway/Render (API) + Supabase Cloud (数据库)

## 架构模式
- 前后端分离，前端 SSR + 后端独立 API 服务
- 后端四层分离: routes -> service -> repository -> schemas
- 前端功能模块化: api.ts + types.ts + hooks/ + components/
- 路由文件薄入口，业务逻辑在 features/ 中

## 目录结构
`
.
  src/              # 前端源码
    routes/         # TanStack Router 文件路由
    features/       # 功能模块目录
    components/ui/  # shadcn/ui 组件
    lib/            # 通用工具

  api-server/       # 后端 API 服务
    src/
      app.ts        # Hono 应用入口
      modules/      # 功能模块（四层分离）
      lib/          # 共享工具（AI 网关、加解密等）
      middleware/   # 认证中间件
      config/      # 全局配置

  supabase/         # 数据库迁移 + 配置

  docs/             # 设计文档
  design-system/    # 设计系统文档
`

## API 端点
- POST   /api/sessions          - 创建面试
- GET    /api/sessions          - 会话列表
- GET    /api/sessions/:id      - 会话详情
- POST   /api/sessions/:id/finish - 完成评分（含维度聚合）
- POST   /api/questions/:id     - 发送消息
- POST   /api/questions/:id/evaluate - 单题评分（含多维度分）
- GET    /api/bank               - 题库列表
- POST   /api/resumes            - 上传简历
- GET    /api/settings           - 获取设置
- PUT    /api/settings           - 更新设置
- GET    /api/skills             - Skill 列表

## 评分维度
- 通用维度（权重2）：沟通表达 / 逻辑思维 / 问题解决
- Skill 维度：CORE(权重3), NORMAL(权重2), ALWAYS_ONE(权重1)
- 加权总分 = sum(score * weight) / sum(weight)
- 优势识别：top3 且 >= 70 分
- 弱项识别：bottom3 且 < 70 分

## 核心模块
| 模块 | 路径 | 功能 |
|------|------|------|
| sessions | modules/sessions/ | 面试会话 CRUD + 完成评分 |
| questions | modules/questions/ | 对话消息 + AI 评分调用 |
| evaluation | modules/evaluation/ | 多维度加权计算 + 弱项分析（禁飞区23）|
| skills | modules/skills/ | Skill 定义 + 出题 Prompt |
| bank | modules/bank/ | 公共题库 |
| resumes | modules/resumes/ | 简历解析上传 |
| settings | modules/settings/ | 用户设置 + API Key 加密 |
| voice | modules/voice/ | 语音面试（Qwen ASR/TTS）|
| model-providers | modules/model-providers/ | AI Provider 路由 |

## 数据库核心表

## AI 禁飞区
1. 面试问题生成的难度递进策略 - prompt-builders.ts
2. 评分的多维度加权计算 - evaluation.service.ts
3. 弱项分析的聚合逻辑 - sessions.service.ts

## 数据库核心表
- interview_sessions    - 面试会话
- interview_questions   - 面试题目
- interview_messages    - 对话消息
- question_bank        - 公共题库
- favorite_questions   - 收藏题目
- resumes              - 简历
- user_settings        - 用户设置
- profiles             - 用户档案