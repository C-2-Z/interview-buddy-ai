# 禁飞区1 详解 - 面试问题生成的难度递进策略

> 对应选题文件要求：A5 AI 面试模拟官 - 禁飞区 1/3
> 手写策略文件：prompt-builders.ts + questions.service.ts + conversation.service.ts
> 总代码量约 180 行手写逻辑

---

## 一、什么是禁飞区1

禁飞区1 要求 "面试问题生成的难度递进策略" 必须手写。它指的是：AI 面试官在多轮对话中，如何逐层深入追问的策略。

注意区分两个阶段：

| 阶段 | 说明 | 是否禁飞区 |
|------|------|-----------|
| 阶段A - 出题 | AI 根据岗位/难度生成第一轮题目列表 | 否，AI 参与，不在禁飞区范围 |
| 阶段B - 追问 | AI 面试官收到候选人回答后决定下一轮问什么、问到什么程度、什么时候停 | 是，属于禁飞区，全部手写 |

禁飞区1 的手写内容不是写了一个算法替代 AI，而是把追问策略写成了一套 AI 必须遵守的规则系统，包含四个要素：

1. 递进层次：追问的深度分层（初级→中级→高级）
2. 轮次控制：每道题最多问几轮
3. 结束判定：什么条件下本题结束
4. 行为约束：AI 禁止做什么

---

## 二、涉及的代码文件

| 文件 | 功能 | 核心函数 |
|------|------|----------|
| questions/prompt-builders.ts | 追问规则 Prompt 工厂 | buildInterviewerSystemPrompt, buildInterviewerUserPrompt, parseCompletionSignal |
| questions/questions.service.ts | 追问循环编排 | sendMessage, autoEvaluateQuestion, buildContext |
| questions/conversation.service.ts | 对话工具函数 | parseConversation, formatConversation, isCopiedQuestion |
| questions/messages.repository.ts | 消息持久化 | appendInterviewMessage |
| sessions/question-generation.service.ts | 初始出题（辅助）| generateGenericQuestions, generateSkillQuestions |

---

## 三、完整面试流程总览

```
                    +--------------------------------------+
                    |  创建面试 (sessions.service.ts)      |
                    |  -> generateGenericQuestions()       |
                    |  -> AI 出初始题目列表                |
                    |  -> 保存到数据库                     |
                    +------------------+-------------------+
                                       |
                                       v
                    +--------------------------------------+
                    |  用户进入面试会话                    |
                    |  顺序回答每一题                      |
                    |                                       |
                    |  对每一题，循环执行：                |
                    |                                       |
                    |   用户回答 -> sendMessage() -> AI     |
                    |        ^              |               |
                    |        |              +- 作弊? 拒答   |
                    |        |              +- 超轮次? 评分 |
                    |        |              +- 完成信号? 评分|
                    |        |              +- 正常追问 ---+ |
                    |        |                              |
                    |   循环结束条件：                      |
                    |     1) 用户回答 > 3 轮（MAX_FOLLOWUPS）
                    |     2) 总消息数 >= 20（MAX_TOTAL_MESSAGES）
                    |     3) AI 返回完成信号                |
                    |                                       |
                    +------------------+-------------------+
                                       |
                                       v
                    +--------------------------------------+
                    |  完成面试 (禁飞区2 和 3)              |
                    |  多维度加权评分 + 弱项聚合分析       |
                    +--------------------------------------+
```

---

## 四、阶段A：初始出题（辅助，非禁飞区）

文件: sessions/question-generation.service.ts

这个阶段不在禁飞区1 范围内，但理解它是理解整体流程的前提。

AI 根据用户选择的岗位、难度、数量等参数，生成初始题目列表。Prompt 由 buildGenericQuestionGenerationPrompt() 组装，包含岗位名称、难度、目标公司等信息。如果有 Skill 预设（如前端工程师），还会从 Skill JSON 中加载预设的知识点和参考题。

AI 以 JSON 数组格式返回题目列表。例如：

["请解释 React 中 useEffect 的依赖数组是如何工作的？", "请解释浏览器的事件循环机制", "页面加载慢怎么优化？"]

---

## 五、阶段B：多轮追问核心（禁飞区1 全部内容）

### 5.1 buildContext() - 构建面试上下文快照

文件: questions.service.ts 第65-76行

每次用户回答后，sendMessage 都会调用 buildContext 构造一个上下文快照。这个快照包含当前面试状态：什么岗位、什么难度、问到第几题、题目是什么。后续拼入 Prompt 让 AI 知道我现在处于什么位置。

对应的 InterviewContext 类型：

| 字段 | 说明 |
|------|------|
| position | 岗位名称（如前端工程师）|
| difficulty | 难度（初级/中级/高级）|
| jobDescription | 岗位需求描述 |
| question | 当前题目文本 |
| totalQuestions | 全场总共几题 |
| currentQuestionIndex | 当前第几题（从0开始）|
| skillId | 关联 Skill ID（可选）|

---

### 5.2 sendMessage() - 追问循环主控（核心手写逻辑）

文件: questions.service.ts 第77-168行

这是整个追问循环的控制中枢，每次用户发送回答都会经过这个函数。它包含一个手写的决策树，决定了下一步怎么做。

```
sendMessage(params)
  |  输入：用户回答文本 + 题目ID
  |
  +-- 步骤1：加载题目信息
  |     getQuestionWithSession(questionId)
  |     从数据库加载题目、所属会话信息
  |
  +-- 步骤2：解析已有对话
  |     conversation = parseConversation(question.answer)
  |     把用户最新回答追加到对话末尾
  |     + 保存消息到数据库 interview_messages
  |
  +-- 步骤3：作弊检测
  |     isCopiedQuestion(content, question.question)
  |     如果用户复制题目文本 -> buildRedirectResponse() 拒绝代答
  |     直接返回，不进 AI
  |
  +-- 步骤4：轮次上限检测（手写硬限制）
  |     MAX_FOLLOWUPS = 3
  |     userMessages > MAX_FOLLOWUPS?
  |     是 -> autoEvaluateQuestion()  // 超限，自动结束
  |     否 -> 继续
  |
  +-- 步骤5：正常追问
  |     1) buildContext() 构建上下文
  |     2) formatConversation() 格式化对话
  |     3) callAI(system=buildInterviewerSystemPrompt)
  |         这里调用的就是禁飞区1 的核心 Prompt 规则
  |     4) 保存 AI 回复
  |
  +-- 步骤6：总消息上限检测
  |     MAX_TOTAL_MESSAGES = 20
  |     conversation.length >= 20?
  |     是 -> autoEvaluateQuestion()
  |
  +-- 步骤7：解析完成信号
  |     parseCompletionSignal(response)
  |     +-- type === complete -> 评分并结束本题
  |     +-- 否则 -> 返回追问给前端，等用户下一次回答
  |
  +-- 回到步骤1（等待用户下一次输入）
```

### 5.3 buildInterviewerSystemPrompt() - 追问规则 Prompt（核心手写）

文件: prompt-builders.ts 第19-48行

这是整个禁飞区1 的灵魂。它不是一个算法，而是一套规则系统——通过 system prompt 让 AI 按照手写的规则进行追问。

**面试上下文段**（第22-26行）

告诉 AI 当前面试状态：什么岗位、什么难度、当前题目、全场进度。这些参数由 buildContext() 动态注入，每次追问都不一样。

**三级递进规则**（第28-34行）- 难度递进的核心

| 层次 | 追问方向 | 能力考察 |
|------|----------|----------|
| 初级 | 概念理解、基础例子、简单场景 | 知不知道 |
| 中级 | 实现细节、方案取舍、故障处理、项目经验 | 做没做过 |
| 高级 | 架构权衡、规模化、风险控制、业务影响、团队协作 | 想没想过 |

每一轮追问都比上一轮更深一层。初级考知不知道，中级考做没做过，高级考想没想过。三段覆盖了从入门到专家的能力评估。

举例（假设题目是 React useEffect）：

| 轮次 | 追问内容 | 能力考察 |
|------|----------|----------|
| 第1轮 | useEffect 和 componentDidMount 有什么区别？ | 概念理解 |
| 第2轮 | 你遇到过 useEffect 无限循环吗？怎么定位的？ | 实践能力 |
| 第3轮 | 几十个 useEffect 怎么管理？有没有替代方案？ | 架构权衡 |

**行为约束**（第33-34行）

这些规则防止 AI 越界：
- 禁止直接回答面试题（AI 是面试官，不是答题者）
- 禁止提前评分（追问还没结束，不能打分）
- 禁止一次问多个问题（避免回答发散）
- 禁止能详细说说吗这类泛问（追问必须有针对性）
- 候选人复制题目/要求代答时拒绝（防作弊）

**结束条件**（第36-40行）

四个条件，逻辑是 OR——任意一个满足就本题结束：

| 条件 | 类型 | 说明 |
|------|------|------|
| 回答充分覆盖知识点 | AI 主观判断 | AI 认为已经问够了 |
| 候选人说不知道/不会/没接触过 | 硬终止 | 候选人放弃回答 |
| 已追问满 3 轮 | 轮次硬限制 | MAX_FOLLOWUPS=3，与代码层双重保障 |
| 回答 >500 字且涵盖关键点 | 长度硬阈值 | 回答已经够详细了 |

**完成信号格式**（第42-43行）

当 AI 判定结束本题时，必须输出固定格式的 JSON：
{"type":"complete","summary":"我对这个问题已经有了足够了解，可以进入评分或下一题。"}

后端的 parseCompletionSignal() 解析这个 JSON，检测到 type=complete 就触发评分。

**输出约束**（第45-47行）

如果还在追问中：只输出面试官下一句话（80-160字），不输出分析过程或 Markdown。确保 AI 回复像真实面试官一样简洁聚焦。

---

### 5.4 buildInterviewerUserPrompt() - 用户消息 Prompt

文件: prompt-builders.ts 第50-60行

这个函数把历史对话 + 最新回答拼成 user prompt，让 AI 知道已经说过什么了。最后一句请只输出面试官下一句话是输出约束的重复，确保 AI 不会长篇大论。

---

### 5.5 parseCompletionSignal() - 完成信号解析

文件: prompt-builders.ts 第86-98行

当 AI 判定这题问够了时，输出固定格式的 JSON 完成信号。parseCompletionSignal 解析这个 JSON：

| AI 回复 | 返回值 | sendMessage 行为 |
|---------|--------|-----------------|
| {"type":"complete","summary":"..."} | {summary: "..."} | 触发评分，本题结束 |
| 其他文本（正常追问）| null | 继续追问循环 |

---

### 5.6 对话工具函数（conversation.service.ts）

| 函数 | 用途 | 边界情况 |
|------|------|----------|
| parseConversation | 从数据库读取对话记录 | 兼容旧格式（纯文本 vs JSON 数组）|
| formatConversation | 对话转纯文本（给 AI 看）| 空数组返回空字符串 |
| combinedCandidateAnswer | 提取候选人所有回答（给评分用）| 只取 role=user 的消息 |
| isCopiedQuestion | 检测是否复制题目 | 纯字符串比较（trim 后全等）|
| buildRedirectResponse | 代答时的拒绝回复 | 硬编码的中文字符串 |

---

## 六、完整追问模拟

假设面试：前端工程师 / 中级 / 第一题 请解释 React 的盒模型

```
第1轮
用户回答: CSS 盒模型分为 content-box 和 border-box...
-> AI 初级追问: content-box 和 border-box 的主要区别是什么？在实际开发中你更倾向用哪一种？

第2轮
用户回答: 一般用 border-box 更方便，content-box 在传统布局中用得更多...
-> AI 中级追问: 如果在项目中从 content-box 切换到 border-box，需要注意哪些兼容性问题？

第3轮
用户回答: 需要检查全局样式覆盖，有些第三方组件可能强制用 content-box...
-> AI 高级追问: 如果一个大型项目的 CSS 规范混用了两种盒模型，你会怎么设计和推行重构方案？

第4轮
用户回答: 首先做全局审计，确定哪些地方用了 content-box...（回答很长）
-> userMessages(4) > MAX_FOLLOWUPS(3)? 是 -> 轮次超限
-> autoEvaluateQuestion() -> AI 评分 -> 本题结束
```

追问的递进：
1. 初级：考概念理解（知不知道区别）
2. 中级：考实践能力（有没有处理过兼容性问题）
3. 高级：考架构思维（大规模项目如何设计规范）
4. 第4轮被轮次上限拦截 -> 自动评分结束

每一步追问的递进不是 AI 自己决定的，而是 Prompt 里的规则迫使 AI 这样问。规则是手写的，这就是禁飞区1 的核心。

---

## 七、手写 vs AI 的分界线

```
手写（禁飞区1 范围）：

questions.service.ts:
  sendMessage() 主循环       - 决策树逻辑
  buildContext()            - 上下文构建
  autoEvaluateQuestion()    - 自动评分触发
  MAX_FOLLOWUPS = 3         - 轮次硬限制
  MAX_TOTAL_MESSAGES = 20   - 消息总数硬限制

prompt-builders.ts:
  buildInterviewerSystemPrompt() - 三级递进规则
  buildInterviewerUserPrompt()   - 对话历史组装
  parseCompletionSignal()        - 完成信号解析

conversation.service.ts:
  parseConversation()       - 对话解析
  formatConversation()      - 格式化
  isCopiedQuestion()        - 代答检测
  buildRedirectResponse()   - 代答拒绝

AI 参与（不在禁飞区范围）：

question-generation.service.ts:
  generateGenericQuestions()  - AI 生成初始题目
  generateSkillQuestions()    - Skill 驱动出题

每次追问中 AI 生成的具体追问语句
  - AI 按照手写规则生成追问文本
  - 但按什么规则问完全是手写的
```

禁飞区1 要求的是策略手写——规则系统是手写的，规则执行后的具体追问语句由 AI 根据规则生成，这是课程允许的。

---

## 八、关键设计决策

| 决策 | 选型 | 原因 |
|------|------|------|
| 追问规则用 Prompt 而非代码 | 自然语言描述比 if-else 更灵活 | 三级递进的边界是模糊的，用代码写 if-else 会非常僵硬 |
| MAX_FOLLOWUPS = 3 | 3 轮追问 + 1 轮初始回答 = 每题最多 4 轮对话 | 平衡深入程度和面试时长 |
| 双重轮次限制（Prompt + 代码）| Prompt 告诉 AI 最多问 3 轮，代码层也会拦截超过 3 轮的 | 即使 AI 不遵守 Prompt 规则，代码也能兜底 |
| JSON 完成信号 | AI 输出结构化的 type=complete 让后端可以精确判断 | 比让 AI 说好的我们结束吧这种自然语言更可靠 |
| 字符串比较做代答检测 | isCopiedQuestion 是纯字符串全等比较 | 简单有效，但只能检测完全复制；语义级别的检测留给 AI |

---

## 九、与其他禁飞区的关系

三条禁飞区在面试流程中的位置不同：
- 禁飞区1 控制怎么问——追问的深度和节奏
- 禁飞区2 控制怎么算分——多维度加权平均
- 禁飞区3 控制怎么分析——从各题维度分识别优劣势

用户回答 -> 禁飞区1 追问循环 -> 本题结束 -> 禁飞区2 逐题评分 -> 全部结束 -> 禁飞区3 聚合分析

---

## 附录：代码索引速查

| 代码 | 文件 | 行号 |
|------|------|------|
| InterviewContext 类型定义 | prompt-builders.ts | 3-11 |
| buildInterviewerSystemPrompt() | prompt-builders.ts | 19-48 |
| buildInterviewerUserPrompt() | prompt-builders.ts | 50-60 |
| parseCompletionSignal() | prompt-builders.ts | 86-98 |
| sendMessage() 追问主循环 | questions.service.ts | 77-168 |
| buildContext() 上下文构建 | questions.service.ts | 65-76 |
| autoEvaluateQuestion() 自动评分 | questions.service.ts | 177-200 |
| parseConversation() | conversation.service.ts | 3-12 |
| formatConversation() | conversation.service.ts | 14-18 |
| isCopiedQuestion() | conversation.service.ts | 24-25 |
| buildRedirectResponse() | conversation.service.ts | 28-30 |
| MAX_FOLLOWUPS | questions.service.ts | 25 |
| MAX_TOTAL_MESSAGES | questions.service.ts | 26 |
| generateGenericQuestions() | question-generation.service.ts | 21-45 |