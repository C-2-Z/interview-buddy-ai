# Sprint 1 验收准备指南 - EZMock (A5 AI 面试模拟官)

> 生成时间: 2026-07-11
> 验收时间: 2026-07-11 下午 14:00-17:30
> 评分上限: 70 分（非 100 分）

---

## 一、验收流程速查（共 18 分钟）

验收分四个步骤：
1. 项目运行检查 (3 min) - 现场启动项目，演示核心功能
2. 文档与规范审查 (5 min) - 设计文档、Git 提交记录、AI 使用日志
3. 代码走查 (6 min) - 逐行讲解代码、AI 禁飞区代码确认手写
4. Bug 注入测试 (4 min) - 老师注入 1 个 Bug，现场定位并调试

## 二、评分维度对照（满分 70 分）

| 评分维度 | 分值 | 考察要点 |
|----------|------|----------|
| 项目运行与功能完成度 | 20 分 | 能否启动、核心功能是否可用 |
| 设计文档与过程规范 | 15 分 | 文档是否自己写的、Git 提交是否细粒度、AI 日志是否完整 |
| 代码理解与把控 | 20 分 | 能否逐行讲解代码、AI 禁飞区是否手写 |
| Bug 调试能力 | 10 分 | 能否定位 Bug、调试思路是否清晰 |
| 团队协作 | 5 分 | 角色分工明确、所有成员都有贡献 |

> 代码走查是最关键的一步。老师会让你逐行讲解代码逻辑并随机提问。如果讲不清，即使代码能跑，这部分也会被扣分。

---

## 三、项目当前状态评估

### 技术栈

- 前端: TanStack React Start (SSR, React 19) + Tailwind CSS 4 + shadcn/ui
- 后端: Hono (Node.js/TS) + Supabase (PostgreSQL + Auth)
- AI: DeepSeek / OpenAI / Anthropic（多模型切换）
- 语音: Qwen ASR（语音识别）+ Qwen TTS（语音合成）
- 存储: AES-256-GCM 加密存储用户 API Key

### 已完成功能（全部可演示）

- 着陆页 / - 品牌展示 + CTA
- 用户认证 /auth - 邮箱/密码注册登录（Supabase Auth）
- 仪表盘 /dashboard - 功能入口导航
- 创建面试 /new - 岗位/技能选择 + 难度 + 题目数量 + 目标公司 + 简历上传
- 面试会话 /session/{id} - 多轮 AI 追问对话（含难度递进策略）
- 评分完成页 - 综合评分 + 已评分题数
- 面试报告 /interviews/{id} - 逐题得分反馈 + 综合报告 + 导出 PDF
- 历史记录 /interviews - 历史面试列表
- 公共题库 /bank - 题库刷题模式
- 简历库 /resumes - PDF/DOCX 简历解析上传
- 语音面试 /voice - 语音问答交互
- 设置 /settings - 多模型切换 + API Key 加密配置
- Skill 驱动出题 - 按岗位 Skill JSON 配置驱动出题
- 多模型 - DeepSeek/OpenAI/Anthropic Provider 切换

### 构建验证状态

- npm run build - 通过
- api-server npm run build - 通过
.env 配置文件 - 完整
Git 双远程 - GitLab + GitHub

## 四、项目运行准备（步骤 1 - 3 min）

### 4.1 确保项目能本地启动

```
# 终端 1：API 服务（监听 :3001）
cd api-server
npm run dev

# 终端 2：前端（监听 :3000）
npm run dev

# 或一键启动
.\AI面试官助手.ps1
```

### 4.2 验证关键依赖

- Supabase 服务可访问（检查 .env 中的 URL）
- DeepSeek API Key 有效
- 语音 API 密钥有效（如演示语音面试）
- 加密密钥存在

### 4.3 30 秒快速演示脚本

1. 打开浏览器 - localhost:3000（着陆页）
2. 点击"开始练习" - 跳转 /auth
3. 输入邮箱/密码 - 登录（演示认证流程）
4. 进入仪表盘 - 点击"创建面试"
5. 选择岗位（如"前端开发"）+ 难度（中级）+ 设置 3 题
6. 点击"开始面试" - 进入面试会话
7. 回答 1-2 题（含 AI 追问）- 完成面试
8. 查看评分报告（综合分 + 逐题反馈）

### 4.4 备选演示路径

- 主路径: 创建 - 对话 - 评分
- 题库刷题: /bank - 选题 - 回答 - AI 评分
- 语音面试: /voice/new - 语音对话
- 模型切换: /settings - 切换 DeepSeek/OpenAI/Anthropic

## 五、文档与规范准备（步骤 2 - 5 min）

### 5.1 现有文档清单

| 文档 | 路径 | 说明 |
|------|------|------|
| 架构设计规范 | AGENTS.md | 技术栈、模块化规范、路由约定 |
| 设计系统 | design-system/MASTER.md | 品牌色、字体、交互规范 |
| 开发路线图 | TODO.md | Phase 1-5 完成度跟踪 |
| 进度追踪 | PROGRESS.md | Phase 3 / C2 简历解析进度 |
| 需求文档 | requirements.md | 产品需求描述 |
| Skill 分析 | skill-analysis.md | 出题策略分析 |
| 开发计划 | docs/phase3-c2-development-plan.md | C2 简历解析计划 |

### 5.2 建议补充的文档

1. API 接口文档（简要）
   - POST /api/sessions - 创建面试会话
   - GET /api/sessions - 获取会话列表
   - GET /api/sessions/:id - 获取会话详情（含题目）
   - POST /api/sessions/:id/finish - 完成并评分
   - POST /api/questions/:id - 发送对话消息
   - POST /api/questions/:id/evaluate - 评分单题
   - POST /api/resumes - 上传简历
   - GET /api/bank - 获取题库
   - GET/PUT /api/settings - 获取/更新设置

2. 数据模型设计（简要）
   - 核心表: sessions, questions, interview_messages, resumes, user_settings
   - 主要字段说明

3. AI 使用日志 - 记录每个模块使用的 AI 能力

## 六、AI 禁飞区详解（步骤 3 - 核心！）

A5 项目的 3 个禁飞区功能必须手写，能讲清每一行代码的用途。

### 6.1 禁飞区 1：面试问题生成的难度递进策略

实现文件: api-server/src/modules/questions/prompt-builders.ts
函数: buildInterviewerSystemPrompt()

核心逻辑（手写 Prompt 策略）:
- 每道题最多追问 3 轮，超出必须结束
- 追问递进层次：使用经验 - 原理机制 - 边界条件/优化方案
- 每轮只提出 1 个核心追问
- 初级：概念理解、基础例子、简单场景
- 中级：实现细节、方案取舍、故障处理、项目经验
- 高级：架构权衡、规模化、风险控制、业务影响、团队协作
- 结束条件：回答充分 / 不知道 / 已满 3 轮 / 回答极长且完整

讲解要点:
1. 这是手写的 Prompt 策略，定义了追问的行为模式
2. 三个递进层次对应候选人的能力深度：知道 -> 理解 -> 运用
3. 每轮只问 1 个问题，避免信息过载
4. 轮次上限（3 轮）防止无限循环
5. 有明确的结束条件判定

### 6.2 禁飞区 2：评分的多维度加权计算

实现文件: api-server/src/modules/questions/evaluation.service.ts + prompt-builders.ts

当前实现: 评分委托给 AI，返回 {score: 1-100, feedback: string}
- buildEvaluationPrompt() 定义了评分维度：准确性、深度、逻辑性、沟通能力、岗位匹配度
- evaluateConversation() 调用 AI 并解析 JSON 结果

风险：这不是手写的加权计算，而是完全由 AI 打分

整改建议：
1. 理解当前逻辑 - 在 Prompt 中可看到 5 个维度，能讲清为什么选这些维度
2. 准备好解释 - "采用了 LLM 结构化输出评分，每个维度权重通过 Prompt 内隐式控制。Sprint 2 计划实现手写加权计算"
3. 建议增加手写函数 - 在 evaluation.service.ts 中增加 calculateWeightedScore()

### 6.3 禁飞区 3：弱项分析的聚合逻辑

实现文件: api-server/src/modules/sessions/sessions.service.ts（函数 finishSession）

当前实现:
- 综合分 = 各题得分的平均值（简单平均）
- 综合反馈 = AI 根据各题反馈生成的总结

风险：只有简单的平均分计算，没有真正的弱项分析

整改建议：
1. 理解当前逻辑 - 能讲清综合分的计算方式和为什么这样设计
2. 准备好改进思路 - "Sprint 2 计划按技术/行为/场景维度聚类分析，识别弱项维度"

## 七、Bug 注入测试准备（步骤 4 - 4 min）

### 7.1 心态准备
- Bug 注入是为了看调试思路，不是考你能不能修好
- 展示思路比修复更重要
- 不会修也没关系，展示排查过程

### 7.2 调试方法
- 查看 API 日志: cd api-server && npm run dev
- 前端检查: 浏览器 F12 - Console / Network / Sources
- 数据库检查: npx supabase db dump

### 7.3 调试步骤模版
1. 复现 Bug - 什么操作导致什么错误
2. 看 Console/Network - 前端报错还是 API 报错
3. 看 API 日志 - 请求参数和响应
4. 定位代码 - 根据报错找到对应文件和行号
5. 分析原因 - 空指针 / 类型错误 / 逻辑错误 / API 超时
6. 修复思路 - 说出打算怎么改

### 7.4 常见 Bug 注入位置
- prompt-builders.ts - Prompt 语法错误、上下文缺失
- question-generation.service.ts - JSON 解析失败、空数组处理
- conversation.service.ts - 消息格式错误、JSON 解析异常
- sessions.service.ts - 评分计算溢出、空值处理
- evaluation.service.ts - 评分范围越界、空反馈
- use-conversation.ts - 状态更新错误、无限循环

## 八、团队分工建议

| 角色 | 负责模块 | 讲解重点文件 |
|------|----------|-------------|
| 主讲人 | 整体演示 + 架构 | AGENTS.md + 演示流程掌控 |
| 成员 A | 面试核心流程 | sessions.service.ts + question-generation.service.ts |
| 成员 B | AI 对话 + 评分（禁飞区）| prompt-builders.ts + evaluation.service.ts |
| 成员 C | 前端展示 + 报告 | 前端组件 + API 调用 + 报告页面 |
| 成员 D | 语音 + 简历 + 设置 | voice/ + resumes/ + settings/ + 加密模块 |

要求：所有成员都能讲清自己负责部分的代码。验收前组内互相讲一遍。

## 九、验收前紧急 TODO（按优先级）

### P0 - 今天必须完成
- 本地启动测试：npm run dev + npm run api:dev，确认无报错
- 准备好 30 秒演示脚本，确定演示顺序
- 组内预讲一遍代码（每人对着自己的代码至少讲一遍）
- 确认每位成员都能讲清自己负责的代码
- 准备好 Git 仓库链接发给验收老师
- 确认禁飞区代码能讲清

### P1 - 强烈建议完成
- 准备简要的接口设计文档（主要端点 + 格式）
- 准备数据模型设计（核心表 + 字段）
- 准备 AI 使用日志（每个模块用了什么 AI）
- 为禁飞区 2-3 准备手写代码或清晰的解释

### P2 - 有时间再完善
- 创建 .agent 目录（conventions.md, architecture.md）
- 补充更完整的禁飞区手写代码
- 准备 AI 使用反思报告

## 十、常见扣分点检查清单

| 常见问题 | 后果 | 检查状态 |
|----------|------|----------|
| 项目启动报错 | 项目运行项直接 0 分 | 已验证 build 通过 |
| 代码讲不清 | 代码理解项被扣分 | 建议组内预讲一遍 |
| 设计文档是 AI 直接生成的 | 文档项被扣分 | 准备自己的思考过程 |
| Git 提交全是大块 | 过程规范被扣分 | Commit 粒度合理（76 commits）|
| 禁飞区代码不会讲 | 代码理解项被扣分 | 重点准备！|
| 所有成员只有一人能讲代码 | 团队协作被扣分 | 每人准备自己的部分 |

## 附录 A：Git 仓库信息

- GitLab: http://csgitlab.whu.edu.cn/2025-2026-3-advancedprograming/2026-27-ez-mock.git
- GitHub: https://github.com/C-2-Z/interview-buddy-ai.git
- 当前分支: cys（开发中），main（主分支）
- 提交数: 76 commits
- 格式: feat/fix/docs/config(db): 中文描述

## 附录 B：关键代码文件索引

| 文件路径 | 功能 | 关联禁飞区 |
|----------|------|-----------|
| api-server/src/modules/questions/prompt-builders.ts | 面试官 Prompt + 评分 Prompt | 禁飞区1(难度递进) + 禁飞区2(评分维度) |
| api-server/src/modules/questions/evaluation.service.ts | AI 评分调用 | 禁飞区2(评分计算) |
| api-server/src/modules/sessions/sessions.service.ts | 面试业务逻辑 + 完成评分 | 禁飞区3(弱项聚合) |
| api-server/src/modules/sessions/question-generation.service.ts | AI 出题 | 禁飞区1(题目生成) |
| api-server/src/modules/questions/conversation.service.ts | 对话管理 | - |
| api-server/src/modules/skills/skills.service.ts | Skill 出题 | - |
| api-server/src/modules/resumes/resumes.service.ts | 简历解析 | - |
| api-server/src/modules/settings/encryption.service.ts | API Key 加密 | - |
| src/features/interview-session/hooks/use-conversation.ts | 前端对话状态 | - |
| src/features/interview-session/hooks/use-session.ts | 前端会话生命周期 | - |

---

## 附录D：文档清单汇总

验收步骤2（文档与规范审查）需要准备的材料清单：

| 编号 | 文档 | 路径 | 说明 |
|------|------|------|------|
| 1 | 架构设计文档 | docs/architecture-design.md | 系统架构、技术栈、数据流 |
| 2 | 接口设计文档 | docs/api-design.md | 全部API端点+请求/响应格式 |
| 3 | 数据模型设计 | docs/data-model.md | 8张核心表定义+ER关系 |
| 4 | AI使用日志 | docs/ai-usage-log.md | 每个模块的AI使用方式+禁飞区自查 |
| 5 | 架构约定 | .agent/architecture.md | 项目架构概要 |
| 6 | 开发约定 | .agent/conventions.md | 模块化规范+Git提交规范 |
| 7 | 架构设计规范 | AGENTS.md | 项目顶层规范 |
| 8 | 设计系统 | design-system/MASTER.md | 品牌色、字体、交互规范 |
| 9 | 开发路线图 | TODO.md | 功能完成度跟踪 |
| 10 | 需求文档 | requirements.md | 产品需求描述 |

提醒: 以上文档均已生成，验收前请熟悉内容，确保能回答为什么这样设计。

## 附录E：验收前快速检查清单

### 项目运行（3 min）
- 前端 npm run dev 无报错
- API服务 npm run api:dev 无报错
- 浏览器打开 localhost:3000 正常显示
- 准备30秒演示脚本
- 准备备用演示路径

### 文档与规范（5 min）
- docs/architecture-design.md（架构设计）
- docs/api-design.md（接口设计）
- docs/data-model.md（数据模型）
- docs/ai-usage-log.md（AI使用日志）
- .agent/architecture.md
- .agent/conventions.md
- 准备好Git仓库链接

### 代码走查（6 min）
- 每人确认好自己的讲解文件
- 禁飞区1（难度递进）能讲清 prompt-builders.ts
- 禁飞区2（评分维度）能讲清 evaluation.service.ts
- 禁飞区3（弱项聚合）能讲清 sessions.service.ts
- 组内互相讲一遍代码

### Bug注入（4 min）
- 准备好调试工具（F12 Console/Network）
- 准备好排查思路模版
- 心态: 展示思路比修复更重要

### 团队协作（5分）
- 每人都有明确分工和负责代码
- 所有成员了解验收流程和评分标准