# EZMock AI 面试模拟器

EZMock 是一个面向求职者的 AI 面试训练平台。系统支持文字与实时语音面试，可结合岗位描述、目标公司、简历、公共题库、岗位 Skill、个人知识库和受控联网研究进行提问，并基于候选人原话完成证据化评分与综合报告。

当前唯一可写面试运行时是 `agent-v3`。它使用 LangGraph 管理可恢复流程，使用 Supabase PostgreSQL 保存业务事实与持久事件，支持 DeepSeek、OpenAI、Anthropic 模型以及 Qwen ASR/TTS/Embedding。

## 核心能力

- 文字教练模式与沉浸式语音模拟模式。
- 单面试官与技术/主管/HR 多角色面板。
- JD、公司、简历、Skill、题库、Brain 和联网研究联合选题。
- 最多三轮聚焦追问、输入防护、幂等提交和断线恢复。
- 基于真实回答引用的冻结维度评分与确定性报告。
- 简历解析、公共题库、知识库/RAG、知识图谱和长期训练记忆。
- DeepSeek/OpenAI/Anthropic 切换及用户 API Key 加密存储。
- TanStack Start Web SSR 与 Tauri 2 Windows 客户端。

## 技术栈

| 层     | 技术                                                         |
| ------ | ------------------------------------------------------------ |
| 前端   | TanStack React Start、React 19、TanStack Router、React Query |
| UI     | Tailwind CSS 4、shadcn/ui、Radix UI                          |
| API    | Hono、Node.js、Zod                                           |
| Agent  | LangGraph、PostgreSQL Checkpointer                           |
| 数据   | Supabase PostgreSQL、Auth、RLS、pgvector                     |
| AI     | DeepSeek、OpenAI、Anthropic、Qwen、Tavily/Wikimedia          |
| 桌面端 | Tauri 2、Rust、WebView2、MSI                                 |

## 快速开始

要求 Node.js 22。

```powershell
npm install
```

在仓库根目录根据 `.env.example` 创建 `.env`，至少配置 Supabase、模型和 Agent Checkpoint 所需变量。

```powershell
# 终端 1：API，默认 http://localhost:3001
npm run api:dev

# 终端 2：Web
npm run dev
```

验证：

```powershell
npm test
npm run lint
npm run build
npm run build:native:dev
npm run verify:native
npm run build:api
```

## 项目结构

```text
apps/
  web/                       TanStack Start Web 与 Native SPA
    src/                     路由、业务 feature 与共享能力
    public/                  Web 静态资源
  api/                       Hono API 服务
    src/modules/             后端业务模块
    src/shared/              Auth、DB、AI、日志基础设施
  desktop/                   Tauri 桌面应用 workspace
    src-tauri/               Rust、权限与打包配置
api/                         Vercel SSR 函数入口
supabase/migrations/         数据库增量迁移
docs/                        规范化项目软件工程文档
  api.md                     当前 API 契约
  *.md                       中文命名的需求、设计、质量和运维文档
```

## 文档中心

| 文档                                         | 主要读者         | 职责                                        |
| -------------------------------------------- | ---------------- | ------------------------------------------- |
| [项目概述](docs/项目概述.md)                 | 全体成员         | 产品定位、系统边界、功能与技术全景          |
| [需求规格说明书](docs/需求规格说明书.md)     | 产品、开发、测试 | 用户流程、功能/非功能需求与验收标准         |
| [系统架构设计](docs/系统架构设计.md)         | 架构、开发       | 系统上下文、状态边界、数据流与 ADR          |
| [详细设计说明书](docs/详细设计说明书.md)     | 开发、设计       | 模块、Agent、语音、知识库、UI/UX 与错误设计 |
| [API 参考](docs/api.md)                      | 前后端、测试     | 当前 HTTP、SSE、WebSocket 契约              |
| [数据模型设计](docs/数据模型设计.md)         | 后端、DBA        | 表、关系、RLS、RPC、Checkpoint 与迁移规则   |
| [安全与隐私设计](docs/安全与隐私设计.md)     | 全体成员         | 威胁边界、密钥、隐私、保留与事件响应        |
| [开发指南](docs/开发指南.md)                 | 开发、AI         | 环境、模块规范、Review、Git 与接手流程      |
| [测试与质量保证](docs/测试与质量保证.md)     | 开发、测试       | 测试分层、关键不变量、验收与发布门禁        |
| [部署与运维指南](docs/部署与运维指南.md)     | 运维、发布       | Web/API/Native 部署、监控、Runbook 与回滚   |
| [产品与技术路线图](docs/产品与技术路线图.md) | 产品、项目负责人 | 当前基线、优先级、技术债与退出条件          |
| [变更日志](docs/变更日志.md)                 | 全体成员         | 可核验的重要项目变更和未发布变更            |

推荐阅读：新成员按“概述 → 需求 → 架构 → 开发 → 测试”；AI 接手先读本文件和 [AGENTS.md](AGENTS.md)，再阅读任务相关文档。

## 重要约束

- 后端新增功能必须创建独立 `apps/api/src/modules/<feature>/` 模块。
- 前端新增功能必须创建独立 `apps/web/src/features/<feature>/` feature。
- `apps/web/src/routes/*.tsx` 只做路由声明和页面壳；禁止手工编辑 `routeTree.gen.ts`。
- 禁止裸 `console.*`，统一使用带 tag 的 consola logger。
- 新面试只允许 `agent-v3`；不得恢复 Agent v1/v2 写链路。
- 未治理 Supabase 迁移历史前，不得直接执行全量 `supabase db push` 或 `db reset`。

完整协作规则见 [AGENTS.md](AGENTS.md)。

## 文档维护规则

1. 文档与代码冲突时，以当前代码为准，并在同一变更中修正文档。
2. API 以 `apps/api/src/app.ts`、实际 `*.routes.ts` 和当前 OpenAPI 配置为准。
3. 数据库以不可变增量 migration、Repository 与 RPC 调用为准。
4. 规划内容只进入路线图或明确标记为“规划”的章节。
5. 周报、截图、聊天记录和临时交接稿不进入项目文档。
6. 文档不得包含真实凭据、用户简历、回答全文或生产敏感数据。
