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
Set-Location api-server
npm install
Set-Location ..
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

Set-Location api-server
npm test
npm run build
```

## 项目结构

```text
src/                         前端、SSR 与跨端共享代码
  routes/                    TanStack Router 薄路由
  features/                  前端业务 feature
  shared/                    HTTP、运行配置、平台适配
api-server/src/
  modules/                   后端业务模块
  shared/                    Auth、DB、AI、日志基础设施
supabase/migrations/         数据库增量迁移
src-tauri/                   Windows Tauri 2 工程
docs/                        全部项目文档、设计资料、周报与验收证据
  design-system/             UI 设计系统
  weekly-reports/            团队与项目周报
  acceptance-evidence/       验收截图等证据
```

## 文档

从 [文档中心](docs/README.md) 开始阅读。关键入口：

- [项目概述](docs/project-overview.md)
- [需求规格说明](docs/requirements.md)
- [系统架构](docs/architecture.md)
- [详细设计](docs/detailed-design.md)
- [开发指南](docs/development.md)
- [AI 接手指南](docs/ai-handoff.md)

## 重要约束

- 后端新增功能必须创建独立 `api-server/src/modules/<feature>/` 模块。
- 前端新增功能必须创建独立 `src/features/<feature>/` feature。
- `src/routes/*.tsx` 只做路由声明和页面壳；禁止手工编辑 `routeTree.gen.ts`。
- 禁止裸 `console.*`，统一使用带 tag 的 consola logger。
- 新面试只允许 `agent-v3`；不得恢复 Agent v1/v2 写链路。
- 未治理 Supabase 迁移历史前，不得直接执行全量 `supabase db push` 或 `db reset`。

完整协作规则见 [AGENTS.md](AGENTS.md)。
