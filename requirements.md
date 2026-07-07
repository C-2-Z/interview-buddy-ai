# AI 面试模拟器 — 已完成功能需求文档

> 版本: v1.0 | 最后更新: 2026-07-07

---

## 1. 产品概述

AI 面试模拟器是一个基于 AI 的面试练习平台，帮助求职者通过模拟真实面试场景提升面试技巧。用户选择目标岗位与难度级别，AI 面试官为其生成定制化面试题，逐题进行多轮对话，完成后给出评分和可执行的改进建议。

---

## 2. 功能模块清单

### 2.1 着陆页 (Public Landing Page)
**路由**: `/` | **文件**: `routes/index.tsx`

#### 功能描述
面向未登录用户的品牌着陆页，展示产品定位和核心价值。

#### 界面要素
- 顶部导航栏：产品名称 + "登录"按钮 + "开始练习"按钮
- 品牌标语："让每一次面试都胸有成竹"（带渐变高亮）
- 副标题说明文案
- 三个功能卖点卡片：定制出题、逐题反馈、持续追踪
- "免费开始" CTA 按钮

#### 交互行为
- 点击登录/开始练习 → 跳转 `/auth`
- 点击免费开始 → 跳转 `/auth`

---

### 2.2 用户认证 (Authentication)
**路由**: `/auth` | **文件**: `routes/auth.tsx`

#### 功能描述
支持邮箱/密码注册和登录，接入 Supabase Auth。

#### 界面要素
- 模式切换：登录 / 注册
- 登录模式：邮箱输入框 + 密码输入框
- 注册模式：昵称输入框 + 邮箱输入框 + 密码输入框
- 提交按钮 + 模式切换链接

#### 交互行为
- 首次加载检查是否已登录，已登录自动跳转 `/dashboard`
- 注册成功后自动登录并跳转
- 错误信息通过 toast 显示
- 密码最少 6 位

#### 后端逻辑
- `supabase.auth.signInWithPassword()` — 登录
- `supabase.auth.signUp()` — 注册，自动创建 profile（通过 DB trigger `handle_new_user`）
- 全局 `auth-attacher.ts` 自动将 access_token 附加到所有 server fn 请求头

---

### 2.3 仪表盘 (Dashboard)
**路由**: `/dashboard` | **文件**: `routes/_authenticated/dashboard.tsx`

#### 功能描述
登录后的首页，提供新面试和查看历史的入口。

#### 界面要素
- 欢迎语 "欢迎回来 👋"
- 两个功能卡片：
  - "开始新面试" — 描述 + "立即开始"按钮
  - "历史面试" — 描述 + "查看历史"按钮

#### 交互行为
- 点击"立即开始" → 跳转 `/new`
- 点击"查看历史" → 跳转 `/history`

---

### 2.4 创建新面试 (New Interview)
**路由**: `/new` | **文件**: `routes/_authenticated/new.tsx`

#### 功能描述
用户配置面试参数，AI 根据配置生成定制题目。

#### 界面要素
- 面试岗位输入框（必填，最长 100 字）
- 难度选择器：初级 / 中级 / 高级（默认中级）
- 题目数量选择器：3 / 5 / 7 / 10 题（默认 5 题）
- 个人情况文本框（选填，最长 2000 字）
- "生成面试题" 提交按钮（带 loading 状态 + Sparkles 图标）

#### 交互行为
- 岗位为空时提交触发 toast 提示
- 提交后按钮进入 loading 状态："AI 生成中…"
- 生成成功 toast 提示 + 自动跳转面试会话页
- 生成失败 toast 提示错误信息

#### 后端逻辑 (`createInterviewServerFn`)
- **输入校验**: Zod schema（position, difficulty, background, questionCount）
- **认证**: 通过 `requireSupabaseAuth` 中间件
- **AI 调用**: 调用 DeepSeek API 生成题目 JSON 数组
- **数据持久化**: 创建 `interview_sessions` 记录 + 批量插入 `interview_questions`
- **返回**: 新创建的 sessionId

---

### 2.5 面试会话页 (Active Session)
**路由**: `/session/$id` | **文件**: `routes/_authenticated/session.$id.tsx`

#### 功能描述
核心面试交互页面，支持多轮对话、逐题评分、面试完成。

#### 界面要素 — 概览区域
- 岗位和难度 Badge
- 进度条 + 已完成/总数

#### 界面要素 — 题目导航
- 每题一个编号按钮
- 已完成题目显示 CheckCircle2 图标，当前题高亮
- 未评分题目只能按顺序回答（`i > current + 1` 的按钮禁用）

#### 界面要素 — 未回答题目（多轮对话模式）
- 对话气泡区域：
  - 用户消息右对齐（蓝色底色），AI 消息左对齐（灰色底色）
  - 头像显示 User / Bot 图标
  - 打字 loading 动画
  - 空状态提示："开始你的回答，面试官会与你进行多轮对话"
  - 自动滚动到底部
- 输入区域：
  - Textarea（3行高，最长 5000 字）
  - 字符计数器
  - Enter 发送（Shift+Enter 换行）
  - "发送"按钮 + "结束对话并评分"按钮（对话达到 2 条以上时显示）

#### 界面要素 — 已评分题目（回看模式）
- 对话历史回顾（只读）
- AI 评分（大字号显示） + AI 反馈文本
- "下一题"按钮 / "完成面试并生成总结"按钮

#### 交互行为
- 发送消息：调用 `sendMessage`，AI 以面试官身份回复
- 结束对话评分：调用 `evaluateConversation`，AI 给出 1-100 评分和反馈
- 完成面试：调用 `finishSession`，AI 生成综合总结
- 所有操作均有 loading 状态和 toast 反馈

#### 后端逻辑

**`sendMessage`**
- 读取当前题目的历史对话（存储在 `answer` 字段的 JSON 中）
- 追加用户消息
- 构建面试官角色的系统 Prompt，调用 AI
- 保存 AI 回复到对话历史

**`evaluateConversation`**
- 读取完整对话历史
- 调用 AI 评分（1-100）+ 反馈（300-500 字）
- 保存评分和反馈到 `interview_questions`

**`finishSession`**
- 汇总所有已评分题目的得分和反馈
- 调用 AI 生成综合总结（200-300 字）
- 计算平均分
- 更新 `interview_sessions` 状态为 completed

---

### 2.6 面试完成页 (Completed Session)
**路由**: `/session/$id` (与活跃会话共用一个页面) | **文件**: `routes/_authenticated/session.$id.tsx`

#### 功能描述
面试完成后的结果展示页面。

#### 界面要素
- 顶部总结卡片：
  - Trophy 图标 + "面试完成"
  - 岗位 · 难度
  - 综合评分（大号数字）
  - AI 综合评价文本
- 逐题回顾卡片列表：
  - 每题显示题号 Badge、题目文本、你的回答、AI 反馈
  - 每题右侧显示评分
- 底部操作按钮："再来一次" + "查看历史"

---

### 2.7 历史记录 (History)
**路由**: `/history` | **文件**: `routes/_authenticated/history.tsx`

#### 功能描述
查看所有历史面试记录。

#### 界面要素
- 页面标题 + 记录总数
- "新面试"按钮
- 记录列表（卡片样式）：
  - 岗位名称
  - 难度 Badge + 状态 Badge（已完成 / 进行中）
  - 创建时间（zh-CN 格式）
  - 如果有综合评分，右侧显示大号分数
- 空状态：引导用户"立即开始"

#### 交互行为
- 点击任意记录 → 跳转对应会话页
- 点击"新面试" → 跳转 `/new`

#### 后端逻辑 (`listSessions`)
- 查询当前用户的所有 `interview_sessions`，按时间降序排列
- 返回 id, position, difficulty, status, overall_score, created_at

---

### 2.8 认证布局 (Authenticated Layout)
**路由**: `/_authenticated` | **文件**: `routes/_authenticated/route.tsx`

#### 功能描述
所有需要登录的路由的公共布局。

#### 界面要素
- 顶部粘性导航栏：
  - 产品名称（链接到首页）
  - 导航项：主页 / 新面试 / 历史
  - 登出按钮
- 内容区（max-w-5xl 居中）

#### 交互行为
- 未登录用户访问子路由时自动重定向 `/auth`
- 登出后跳转 `/auth`

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
| background | TEXT | 个人背景（选填） |
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

> 注意: `interview_messages` 表已创建但当前会话页使用 `answer` 字段的 JSON 存储对话而非此表。

### 3.5 安全策略
- 所有表启用 RLS
- 用户只能操作自己的数据（通过 `auth.uid()` 或关联查询验证）
- 注册时通过 DB trigger `on_auth_user_created` 自动创建 profile

---

## 4. 已实现的技术基础设施

### 4.1 AI 网关 (`ai-gateway.server.ts`)
- DeepSeek Chat API 调用封装（OpenAI 兼容协议）
- JSON 提取工具：自动清理 markdown 代码块包裹

### 4.2 认证中间件
- 客户端 `auth-attacher.ts`: 全局 functionMiddleware，自动附加 Bearer token
- 服务端 `auth-middleware.ts`: 校验 token 并注入认证后的 Supabase 客户端

### 4.3 错误处理
- `error-capture.ts`: 全局 error / unhandledrejection 捕获
- `server.ts`: SSR 层错误处理，捕获 h3 吞掉的异常
- `error-page.ts`: 友好错误页面 HTML
- Root route: ErrorComponent + NotFoundComponent

### 4.4 部署配置
- `vercel.json`: 所有路径重写到 `/api/ssr` 的 SSR handler
- `api/ssr.js`: Vercel Serverless Function 入口
- `.output/`: 构建产物包含完整 Nitro SSR server

---

## 5. 用户流程总图

```
未登录                          已登录
┌─────────┐    ┌──────┐    ┌───────────┐
│ 着陆页  │ → │ 登录 │ → │ 仪表盘   │
│  /      │    │ /auth│    │ /dashboard│
└─────────┘    └──────┘    └─────┬─────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
             ┌──────────────┐        ┌──────────────┐
             │ 创建新面试    │        │ 历史记录     │
             │ /new         │        │ /history     │
             └──────┬───────┘        └──────┬───────┘
                    │                        │
                    ▼                        │
             ┌──────────────┐                │
             │ AI 生成题目   │                │
             └──────┬───────┘                │
                    │                        │
                    ▼                        ▼
             ┌──────────────────────────────────┐
             │ 面试会话页 /session/$id          │
             │                                  │
             │ ┌─ 逐题多轮对话 ──────────────┐  │
             │ │ 用户回答 → AI 面试官追问    │  │
             │ │ ↕ 多轮对话 × N             │  │
             │ │ → 结束对话并评分           │  │
             │ └────────────────────────────┘  │
             │                                  │
             │ ┌─ 所有题目完成后 ────────────┐  │
             │ │ 生成综合总结 + 综合评分     │  │
             │ │ session → completed         │  │
             │ └────────────────────────────┘  │
             │                                  │
             │ ┌─ 完成后 ────────────────────┐  │
             │ │ 展示：综合评分 + AI 总结    │  │
             │ │ + 逐题评分 + AI 反馈        │  │
             │ │ + "再来一次" + "查看历史"   │  │
             │ └────────────────────────────┘  │
             └──────────────────────────────────┘
```

---

## 6. 未来开发方向

### A. 面试体验增强

#### A1. 语音回答 (Voice Answer)
支持麦克风录入，语音转文字后提交回答，更接近真实面试场景。

#### A2. 限时模式 (Timed Mode)
每题可设置倒计时（如 3 分钟），模拟真实面试的时间压力。超时自动提交当前回答。

#### A3. 编程题 + 在线编辑器 (Coding Questions)
对技术岗位，支持内置代码编辑器写代码，AI 评估代码质量和实现思路。

#### A4. 追问策略优化 (Follow-up Strategy Optimization)
优化 AI Prompt，让面试官更智能地深挖候选人的薄弱环节，追问更具针对性和深度。

---

### B. 数据与反馈深化

#### B1. 能力雷达图 / 趋势图表
综合多次面试数据，生成能力模型（技术/沟通/逻辑/深度等维度）和进步曲线。

#### B2. 薄弱点识别与推荐练习
AI 自动识别频出的问题点，推荐针对性的练习方向。

#### B3. 面试报告导出
将单次或多次面试报告导出为 PDF 或文档格式，方便存档或分享。

---

### C. 出题与配置扩展

#### C1. 公司定制
输入目标公司名，AI 根据该公司面经风格出题（如字节跳动 vs 外企的面试风格差异）。

#### C2. 简历解析出题
上传简历，AI 根据简历内容和项目经历生成个性化题目。

#### C3. 题型混合配置
允许用户选择题型配比：技术题 / 行为题 / 场景题 / 系统设计各占多少比例。

#### C4. 题库模式（非 AI 出题）
提供一个公共题库，用户可以直接刷题而不依赖 AI 出题。

---

### D. 平台与基础设施

#### D1. 多模型支持
支持切换 DeepSeek / GPT-4o / Claude 等模型，用户可选择或配置兜底模型。

#### D2. 忘记密码 / 邮箱验证
完善 Supabase Auth 的密码重置和邮箱验证标准流程。

#### D3. 移动端适配优化
优化手机端的对话区域、导航和操作体验。

#### D4. 中英文双语支持
面试语言和 UI 语言可独立切换。

#### D5. 分享面试
生成分享链接，让他人（导师 / 朋友）查看面试表现。
