# AI 面试模拟器 — 已完成功能需求文档

> 版本: v2.1 | 最后更新: 2026-07-08

---

## 1. 产品概述

AI 面试模拟器是一个基于 AI 的面试练习平台，帮助求职者通过模拟真实面试场景提升面试技巧。用户选择目标岗位与难度级别，AI 面试官为其生成定制化面试题，逐题进行多轮对话，完成后给出评分和可执行的改进建议。

---

## 2. 功能模块清单

### 2.1 着陆页 (Public Landing Page)
**路由**: `/` | **文件**: `routes/index.tsx`

面向未登录用户的品牌着陆页，展示产品定位和核心价值。

- 顶部导航栏：产品名称 + "登录"按钮 + "开始练习"按钮
- 品牌标语："让每一次面试都胸有成竹"（带渐变高亮）
- 副标题说明文案
- 三个功能卖点卡片：定制出题、逐题反馈、持续追踪
- "免费开始" CTA 按钮

交互：点击登录/开始练习 → 跳转 `/auth`。

---

### 2.2 用户认证 (Authentication)
**路由**: `/auth` | **文件**: `routes/auth.tsx`

支持邮箱/密码注册和登录，接入 Supabase Auth。

- 模式切换：登录 / 注册
- 登录模式：邮箱 + 密码输入框
- 注册模式：昵称 + 邮箱 + 密码输入框
- 提交按钮 + 模式切换链接

后端逻辑：`supabase.auth.signInWithPassword()` / `signUp()`，注册时通过 DB trigger 自动创建 profile。

---

### 2.3 仪表盘 (Dashboard)
**路由**: `/dashboard` | **文件**: `routes/_authenticated/dashboard.tsx`

登录后的首页，提供"开始新面试"和"查看历史"两个入口。

---

### 2.4 创建新面试 (New Interview)
**路由**: `/new` | **文件**: `routes/_authenticated/new.tsx`

用户配置面试参数，AI 生成定制题目。

- 面试岗位输入框（必填，最长 100 字）
- 难度选择器：初级 / 中级 / 高级（默认中级）
- 题目数量选择器：3 / 5 / 7 / 10 题（默认 5 题）
- 岗位需求描述文本框（选填，最长 2000 字）
- "生成面试题" 提交按钮

后端：`apiClient.createInterviewSession()` → POST `/api/sessions` → AI 生成题目 → 存入 `interview_sessions` + `interview_questions` → 返回 sessionId。

---

### 2.5 面试会话页 (Active Session)
**路由**: `/session/$id` | **文件**: `routes/_authenticated/session.$id.tsx`

核心面试交互页面，支持多轮对话、逐题评分、面试完成。

- 概览区域：岗位/难度 Badge + 进度条
- 题目导航：编号按钮，已完成题显示 CheckCircle2 图标
- 未回答：对话气泡区域（用户右对齐蓝色，AI 左对齐灰色）+ Textarea 输入 + 发送/评分按钮
- 已评分：对话历史回顾 + AI 评分 + 反馈 + 下一题/完成按钮

API 调用：
- `apiClient.sendMessage()` → POST `/api/questions/:id/message`
- `apiClient.evaluateConversation()` → POST `/api/questions/:id/evaluate`
- `apiClient.finishSession()` → POST `/api/sessions/:id/finish`

---

### 2.6 面试完成页 (Completed Session)
同 `/session/$id` 页面，`session.status === "completed"` 时展示完成结果：综合评分、AI 综合评价、逐题回顾。

---

### 2.7 历史记录 (History)
**路由**: `/history` | **文件**: `routes/_authenticated/history.tsx`

`apiClient.listSessions()` → GET `/api/sessions`，返回当前用户的所有会话记录（时间降序）。

---

### 2.8 题库 (Question Bank)
**路由**: `/bank` 和 `/bank/$id` | **文件**: `routes/_authenticated/bank/`

`apiClient` → GET `/api/bank`，公共题库列表和题目详情。

---

### 2.9 用户设置 (Settings)
**路由**: `/settings` | **文件**: `routes/_authenticated/settings.tsx`

`apiClient` → GET/PATCH `/api/settings`，选择 AI 供应商（DeepSeek/OpenAI/Anthropic）和管理 API Key（加密存储）。

---

## 3. 数据库表结构

### 3.1 profiles
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 关联 auth.users |
| display_name | TEXT | 用户昵称 |
| created_at | TIMESTAMPTZ | 创建时间 |

### 3.2 interview_sessions
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 自动生成 |
| user_id | UUID FK | 用户 ID |
| position | TEXT | 面试岗位 |
| difficulty | TEXT | 初级/中级/高级 |
| job_description | TEXT | 岗位需求描述（选填） |
| status | TEXT | in_progress / completed |
| overall_score | INT | 综合评分 |
| overall_feedback | TEXT | AI 综合反馈 |
| created_at | TIMESTAMPTZ | 创建时间 |

### 3.3 interview_questions
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 自动生成 |
| session_id | UUID FK | 关联 sessions |
| order_index | INT | 题目顺序 |
| question | TEXT | 题目内容 |
| answer | TEXT | 用户回答 / 对话历史 JSON |
| score | INT | AI 评分 (1-100) |
| feedback | TEXT | AI 反馈文本 |
| created_at | TIMESTAMPTZ | 创建时间 |

### 3.4 interview_messages
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 自动生成 |
| question_id | UUID FK | 关联 questions |
| role | TEXT | user / assistant |
| content | TEXT | 消息内容 |
| created_at | TIMESTAMPTZ | 创建时间 |

> 当前会话页使用 `answer` 字段的 JSON 存储对话，`interview_messages` 表暂未用于运行时。

### 3.5 安全策略
- 所有表启用 RLS，用户只能操作自己的数据
- 注册时通过 DB trigger `on_auth_user_created` 自动创建 profile

---

## 4. 已实现的技术基础设施

### 4.1 架构概览

```
[浏览器] → src/features/*/api.ts → shared/api/http-client.ts → Hono API → Supabase + AI
```

前后端分离，通过 HTTP + Bearer JWT 通信。

### 4.2 API 客户端
`src/features/*/api.ts` 通过 `shared/api/http-client.ts` 发送请求，自动附加 Authorization header。

### 4.3 API 服务
Hono 框架，模块化路由 (`modules/*/*.routes.ts`)，四层分离 (routes/service/repository/schemas)。

### 4.4 多模型 AI
`shared/ai/` 统一入口，支持 DeepSeek / OpenAI / Anthropic。用户设置中的 API Key 通过 AES-256-GCM 加密存储。

### 4.5 Skill 驱动出题
`modules/skills/` 管理岗位技能定义，`lib/skills/_shared/references/` 存放知识点参考资料。

---

## 5. 用户流程总图

```
着陆页 → 登录 → 仪表盘 → 创建面试 → AI 出题 → 逐题多轮对话 → 评分 → 完成 → 综合报告
                              ↓
                          历史记录 ← ← ← ← ←
```

---

## 6. 未来开发方向

### A. 面试体验增强
A1 语音回答、A2 限时模式、A3 编程题+在线编辑器、A4 追问策略优化

### B. 数据与反馈深化
B1 能力雷达图、B2 薄弱点识别、B3 面试报告导出

### C. 出题与配置扩展
C2 简历解析出题（P0）、C5 知识库/RAG

### D. 平台与基础设施
D2 忘记密码、D3 移动端优化、D4 App 打包、D5 双语、D6 分享、D7 Docker、D8 异步任务

---

## 7. 架构约定

### 7.1 功能即模块（核心约束）

> **每个新功能必须是一个独立的模块，禁止将多功能的逻辑混入同一个文件。**

#### 后端模块化规则

```
api-server/src/modules/<feature>/
  ├── <feature>.routes.ts      # 路由注册 + Zod 校验
  ├── <feature>.service.ts     # 业务流程编排
  ├── <feature>.repository.ts  # 数据库访问
  └── <feature>.schemas.ts     # 请求体/响应体校验
```

#### 前端模块化规则

```
src/features/<feature>/
  ├── api.ts                   # API 调用函数
  ├── types.ts                 # TypeScript 类型
  ├── hooks/                   # React Hooks
  └── components/              # UI 组件
```

#### 约束

- 路由文件只做薄入口，业务组件 import 自 `features/`
- 新增 API 端点必须新建模块，在 `app.ts` 中挂载
- 已有模块只能修改自身职责范围内的代码
- 跨功能的改动应在目标模块中新建文件

### 7.2 其他约定

- 前端功能域：`interview-create`、`interview-session`、`question-bank`、`settings`
- 后端模块：`sessions`、`questions`、`skills`、`bank`、`settings`、`model-providers`
- 数据库字段 `job_description`，前端/API 字段 `jobDescription`，UI 文案"岗位需求描述"
- `interview_messages` 表暂不迁移运行时存储，后续仅改 repository
- 多模型 provider 由 `model-providers` 和 `settings` 模块统一处理
