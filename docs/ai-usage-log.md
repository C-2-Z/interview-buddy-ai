# AI 使用日志 — EZMock (A5 AI 面试模拟官)

> 版本: v1.0
> 更新时间: 2026-07-11
> 说明: 记录项目中各功能模块的 AI 使用方式、模型和 Prompt 策略。

---

## 总览

| 功能模块 | AI 能力 | 模型 | Prompt 策略 | 禁飞区 |
|----------|---------|------|-------------|--------|
| 出题 (Question Generation) | 文本生成 | DeepSeek/OpenAI/Anthropic | Skill JSON 驱动 | 禁飞区 1 |
| 面试对话 (Interview Session) | 多轮对话 | 同上 | 追问递进策略（手写）| 禁飞区 1 |
| 评分 (Evaluation) | 结构化输出 | 同上 | 多维度评分 Prompt | 禁飞区 2 |
| 综合报告 (Report) | 文本摘要 | 同上 | 总结 Prompt | 禁飞区 3 |
| 语音识别 (ASR) | Qwen ASR | qwen3-asr-flash-realtime | 无 Prompt | - |
| 语音合成 (TTS) | Qwen TTS | qwen3-tts-flash-realtime | 无 Prompt | - |

---

## 1. AI 出题 (Question Generation)

### 文件位置
- api-server/src/modules/sessions/question-generation.service.ts
- api-server/src/lib/skills/ (Skill 定义 JSON 文件)

### AI 使用方式

系统 Prompt 设定 AI 为专业的面试官助手，用户 Prompt 包含岗位、难度、需求描述等参数。
AI 以 JSON 数组格式返回题目列表。

### 输入参数
- position: 岗位名称
- difficulty: 初级/中级/高级
- jobDescription: 岗位需求描述
- targetCompany: 目标公司
- questionCount: 题目数量
- resumeContext: 简历背景（可选）
- skillId: Skill 定义（可选）

### 输出格式
`json
["题目1", "题目2", "题目3"]
`

### Prompt 策略

涉及禁飞区 1（面试问题生成的难度递进策略）：题目的生成本身由 AI 完成，但 Skill JSON 中预定义了每个岗位的知识点和难度分布，出题时会根据难度参数筛选合适的知识点范围，这是手写的策略逻辑。

---

## 2. 面试对话 (Interview Session)

### 文件位置
- api-server/src/modules/questions/prompt-builders.ts
- api-server/src/modules/questions/conversation.service.ts

### AI 使用方式

系统 Prompt 将 AI 设定为资深面试官，在面试场景中进行多轮追问。每次用户回答后，AI 根据当前上下文生成下一轮追问或完成信号。

### 追问规则（手写）

涉及禁飞区 1：追问规则是手写的 Prompt 策略。

`
追问递进层次:
  初级 -> 概念理解、基础例子、简单场景
  中级 -> 实现细节、方案取舍、故障处理、项目经验
  高级 -> 架构权衡、规模化、风险控制、业务影响、团队协作

结束条件（满足任一即结束本题）:
  1. 候选人的回答已充分覆盖知识点深度
  2. 候选人说不知道不会没接触过
  3. 已追问满 3 轮
  4. 候选人回答极长且完整（>500 字且涵盖关键点）
`

---

## 3. AI 评分 (Evaluation)

### 文件位置
- api-server/src/modules/questions/evaluation.service.ts
- api-server/src/modules/questions/prompt-builders.ts

### AI 使用方式

涉及禁飞区 2（评分的多维度加权计算）。AI 以结构化输出返回评分和反馈。评分维度定义在 Prompt 中，目前由 LLM 内部分配权重。

### 评分维度（Prompt 定义）

| 维度 | 说明 |
|------|------|
| 准确性 | 回答内容的正确程度 |
| 深度 | 技术理解的深入程度 |
| 逻辑性 | 表达的逻辑清晰度 |
| 沟通能力 | 表达的流畅度和专业性 |
| 岗位匹配度 | 回答与岗位需求的契合程度 |

### 输出格式
`json
{
  "score": 85,
  "feedback": "回答准确，展现了深入的技术理解..."
}
`

---

## 4. 综合报告 (Report)

### 文件位置
- api-server/src/modules/sessions/sessions.service.ts

### AI 使用方式

涉及禁飞区 3（弱项分析的聚合逻辑）。综合分通过手写的平均计算得出，综合反馈由 AI 根据各题得分和反馈生成总结。

### 综合分计算（手写）
`	ypescript
const overallScore = scored.length
  ? Math.round(scored.reduce((sum, q) => sum + (q.score ?? 0), 0) / scored.length)
  : 0;
`

### AI 综合反馈 Prompt

AI 接收各题得分和反馈，生成 100-300 字的总结，包含整体表现、亮点和改进方向。

---

## 5. 语音服务 (Voice)

### 文件位置
- api-server/src/modules/voice/

### AI 使用方式

| 服务 | 模型 | 功能 |
|------|------|------|
| Qwen ASR | qwen3-asr-flash-realtime | 语音识别（语音→文字）|
| Qwen TTS | qwen3-tts-flash-realtime | 语音合成（文字→语音）|

语音面试的对话内容复用文本面试的消息存储和 AI 评分逻辑，语音仅作为交互通道。

---

## 6. 简历解析 (Resume Parsing)

### 文件位置
- api-server/src/lib/resume-parser.ts
- api-server/src/lib/resume-analyzer.ts

### 使用方式

| 文件类型 | 解析工具 | 说明 |
|----------|----------|------|
| PDF | pdf-parse | 纯工具解析，无 AI 参与 |
| DOCX | mammoth | 纯工具解析，无 AI 参与 |

简历分析（提取技能、经验等）使用 AI 进行结构化提取。

---

## 7. API Key 加密 (Encryption)

### 文件位置
- api-server/src/lib/encryption.ts
- api-server/src/modules/settings/encryption.service.ts

### 使用方式

用户设置的 API Key 使用 AES-256-GCM 加密后存储到数据库。此功能完全手写，不依赖 AI。

---

## 8. 禁飞区自查

根据选题文件要求，A5 项目的 3 个 AI 禁飞区必须手写。当前状态：

| 禁飞区 | 手写部分 | 仍依赖 AI 的部分 | 说明 |
|--------|----------|-----------------|------|
| 1. 题目生成的难度递进策略 | buildInterviewerSystemPrompt() 三级递进追问规则（prompt-builders.ts:19-48）| 题目文本由 AI 初始生成 | 追问策略完全手写 |
| 2. 评分的多维度加权计算 | aggregateDimensions() 加权平均计算（evaluation.service.ts:40-68）| AI 按维度逐项评分填入分数 | 权重分配和加权公式完全手写 |
| 3. 弱项分析的聚合逻辑 | identifyWeaknesses() 排序+阈值判定（evaluation.service.ts:70-89）| 综合报告文字由 AI 汇总 | 优势/弱项标签完全手写 |