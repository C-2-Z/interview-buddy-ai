# EZMock API 接口设计文档

> 版本: v1.0
> 更新时间: 2026-07-11
> 基础路径: http://localhost:3001/api

---

## 通用约定

- 请求方法: GET / POST / PUT / DELETE
- 请求体格式: application/json
- 响应格式: application/json
- 认证方式: Supabase JWT（Bearer Token，通过 Authorization 头传递）
- 错误响应格式: { error: string, message?: string }
- 数据命名: API 请求体使用 camelCase，数据库字段使用 snake_case

---

## 1. 面试会话 (Sessions)

### POST /api/sessions — 创建面试会话

创建一场新的模拟面试，AI 同步生成题目。

**请求体**:

`json
{
  "position": "前端工程师",           // 岗位名称（必填，1-100 字符）
  "difficulty": "中级",               // 难度：初级 | 中级 | 高级
  "questionCount": 5,                 // 题目数量：3-10，默认 5
  "jobDescription": "精通 React...",  // 岗位需求描述（可选，最长 2000 字符）
  "targetCompany": "字节跳动",        // 目标公司（可选，最长 100 字符）
  "skillId": "frontend",               // Skill ID（可选）
  "questionTypeConfig": {             // 题型配置（可选）
    "技术题": 0.5,
    "行为题": 0.3,
    "场景题": 0.2
  },
  "modelProvider": "deepseek",         // 模型供应商（可选）
  "modelName": "deepseek-chat",       // 模型名称（可选）
  "userApiKey": "sk-xxx...",           // 用户自定义 API Key（可选）
  "resumeId": "uuid",                  // 简历 ID（可选）
  "resumeText": "..."                  // 简历文本（可选，最长 2000 字符）
}
`

**成功响应 201**:

`json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
`

**错误响应 400**:

`json
{
  "error": "Validation Error",
  "message": "position is required"
}
`

---

### GET /api/sessions — 获取会话列表

返回当前用户的所有面试会话，按创建时间倒序排列。

**成功响应 200**:

`json
[
  {
    "id": "uuid",
    "position": "前端工程师",
    "difficulty": "中级",
    "status": "completed",          // in_progress | completed
    "overall_score": 85,
    "overall_feedback": "...",
    "interview_mode": "text",
    "created_at": "2026-07-11T10:00:00Z",
    "last_activity_at": "2026-07-11T10:30:00Z"
  }
]
`

---

### GET /api/sessions/:id — 获取会话详情

返回指定会话的完整信息，包括所有题目。

**成功响应 200**:

`json
{
  "session": {
    "id": "uuid",
    "user_id": "uuid",
    "position": "前端工程师",
    "difficulty": "中级",
    "status": "in_progress",
    "overall_score": null,
    "overall_feedback": null,
    "interview_mode": "text",
    "created_at": "...",
    "last_activity_at": "..."
  },
  "questions": [
    {
      "id": "uuid",
      "session_id": "uuid",
      "order_index": 0,
      "question": "请解释 React 的 Fiber 架构...",
      "answer": null,
      "score": null,
      "feedback": null,
      "skill_id": "frontend",
      "topic_summary": "React"
    }
  ]
}
`

---

### POST /api/sessions/:id/finish — 完成面试并评分

结束指定会话，触发 AI 逐题评分和综合报告生成。

**成功响应 200**:

`json
{
  "overallScore": 85,
  "overallFeedback": "候选人表现良好...（AI 生成的综合反馈）"
}
`

---

## 2. 题目对话 (Questions)

### POST /api/questions/:id — 发送对话消息

向指定题目发送候选人的回答，AI 面试官返回追问或完成信号。

**请求体**:

`json
{
  "content": "React Fiber 是 React 16 引入的新的协调引擎..."
}
`

**成功响应 200**（追问）:

`json
{
  "reply": "你提到了 Fiber 的调度机制，能具体说说它是如何实现任务优先级调度的吗？",
  "type": "follow_up"
}
`

**成功响应 200**（完成）:

`json
{
  "reply": "我对这个问题已经有了足够了解，可以进入评分或下一题。",
  "type": "complete",
  "summary": "候选人展示了扎实的 React 知识..."
}
`

---

### POST /api/questions/:id/evaluate — 评分单题

对指定题目进行 AI 评分。

**请求体**:

`json
{
  "context": {                       // 面试上下文
    "position": "前端工程师",
    "difficulty": "中级",
    "jobDescription": null,
    "question": "...",
    "totalQuestions": 5,
    "currentQuestionIndex": 0
  },
  "conversationText": "面试官: ...\n候选人: ..."
}
`

**成功响应 200**:

`json
{
  "score": 85,
  "feedback": "回答准确，展现了深入的技术理解..."
}
`

---

## 3. 公共题库 (Bank)

### GET /api/bank — 获取题库列表

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| position | string | 否 | 岗位筛选 |
| difficulty | string | 否 | 难度筛选 |
| type | string | 否 | 题型筛选 |
| search | string | 否 | 关键词搜索 |

**成功响应 200**:

`json
[
  {
    "id": "uuid",
    "position": "前端工程师",
    "difficulty": "中级",
    "type": "技术题",
    "question": "请解释 React 中 useEffect 的依赖数组...",
    "tags": ["React", "Hooks", "useEffect"],
    "created_at": "..."
  }
]
`

---

### POST /api/bank/:id/favorite — 收藏/取消收藏

**请求体**: { "favorited": true }

**成功响应 200**: { "favorited": true }

---

## 4. 简历管理 (Resumes)

### POST /api/resumes — 上传简历

**请求体**: FormData (multipart/form-data)

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | 是 | PDF 或 DOCX 文件 |

**成功响应 201**:

`json
{
  "id": "uuid",
  "file_name": "张三_前端_简历.pdf",
  "file_size": 123456,
  "parsed_text": "教育背景: ... 工作经历: ...",
  "analysis": {
    "skills": ["React", "TypeScript", "Node.js"],
    "experience": "3 年前端开发经验",
    "education": "本科"
  }
}
`

---

### GET /api/resumes — 获取简历列表

`json
[
  {
    "id": "uuid",
    "file_name": "张三_前端_简历.pdf",
    "file_size": 123456,
    "created_at": "..."
  }
]
`

---

### GET /api/resumes/:id — 获取简历详情

`json
{
  "id": "uuid",
  "file_name": "...",
  "parsed_text": "...",
  "analysis": { ... },
  "created_at": "..."
}
`

---

## 5. 用户设置 (Settings)

### GET /api/settings — 获取用户设置

`json
{
  "model_provider": "deepseek",
  "model_name": null,
  "keys": {
    "deepseek": "encrypted_value",
    "openai": null,
    "anthropic": null
  }
}
`

---

### PUT /api/settings — 更新用户设置

`json
{
  "model_provider": "openai",
  "model_name": "gpt-4o-mini",
  "keys": {
    "deepseek": "sk-xxx...",
    "openai": "sk-xxx..."
  }
}
`

---

## 6. Skill 管理 (Skills)

### GET /api/skills — 获取 Skill 列表

`json
[
  {
    "id": "frontend",
    "name": "前端工程师",
    "description": "前端开发岗位面试"
  },
  {
    "id": "algorithm",
    "name": "算法工程师",
    "description": "算法与数据结构岗位面试"
  }
]
`

---

## 7. 语音面试 (Voice)

### POST /api/voice/sessions — 创建语音面试

请求体同 POST /api/sessions，自动设置 interview_mode = "voice"。

### WebSocket /api/voice/ws — 语音实时对话

双向 WebSocket 连接，支持 ASR 语音识别和 TTS 语音合成。

---

## 8. 健康检查

### GET /api/health — 服务健康检查

`json
{
  "status": "ok"
}
`

---

## 9. 错误码说明

| HTTP 状态码 | 说明 | 常见场景 |
|-------------|------|----------|
| 200 | 成功 | 正常请求处理完成 |
| 201 | 创建成功 | 创建会话/上传简历 |
| 400 | 请求参数错误 | 参数校验失败 |
| 401 | 未认证 | Token 缺失/过期 |
| 404 | 资源不存在 | 会话/题目/简历未找到 |
| 422 | 业务错误 | AI 出题失败、评分失败 |
| 500 | 服务端错误 | 内部异常 |
