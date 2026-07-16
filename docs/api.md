# API 参考

> 状态：当前；最后核验：2026-07-16；事实源：`api-server/src/app.ts` 与各模块 `*.routes.ts`

## 1. 通用约定

- 本地 API：`http://localhost:3001`。
- JSON 请求使用 `Content-Type: application/json`。
- 用户数据接口使用 `Authorization: Bearer <Supabase access_token>`。
- UUID 路径参数和请求体通过 Zod 校验。
- 错误响应不包含原始模型、数据库或密钥信息。

标准错误：

```json
{
  "error": "用户可读说明",
  "code": "stable_error_code",
  "retryable": false
}
```

公开接口：`GET /api/health`、`GET /api/skills`、`GET /api/openapi.json`、`GET /api/docs`。性能健康接口需要认证。

## 2. 基础接口

| 方法 | 路径                      | 认证 | 用途                |
| ---- | ------------------------- | ---- | ------------------- |
| GET  | `/api/health`             | 否   | 服务健康            |
| GET  | `/api/performance/health` | 是   | 日志/采样能力       |
| GET  | `/api/skills`             | 否   | Skill 元数据        |
| GET  | `/api/settings`           | 是   | 模型偏好和 Key 掩码 |
| PUT  | `/api/settings`           | 是   | 更新模型和加密 Key  |

## 3. 历史会话

| 方法 | 路径                | 用途                 |
| ---- | ------------------- | -------------------- |
| GET  | `/api/sessions`     | 当前用户会话列表     |
| GET  | `/api/sessions/:id` | 会话详情与旧记录兼容 |

该模块当前只读。旧 `POST /api/sessions` 和 `/api/questions/*` 不在 `app.ts` 挂载。

## 4. Agent

| 方法   | 路径                                           | 说明                        |
| ------ | ---------------------------------------------- | --------------------------- |
| GET    | `/api/agent/readiness`                         | 创建前能力检查              |
| POST   | `/api/agent/sessions`                          | 创建 Agent v3，返回 202     |
| GET    | `/api/agent/sessions/:sessionId`               | 最新 snapshot               |
| POST   | `/api/agent/sessions/:sessionId/input`         | 提交幂等文字输入            |
| POST   | `/api/agent/sessions/:sessionId/interrupt`     | 打断输出                    |
| POST   | `/api/agent/sessions/:sessionId/finish`        | 读取/确认完成结果           |
| POST   | `/api/agent/sessions/:sessionId/retry`         | 重试失败准备阶段            |
| GET    | `/api/agent/sessions/:sessionId/events`        | SSE 持久事件流              |
| GET    | `/api/agent/sessions/:sessionId/workspace`     | 完整恢复投影                |
| GET    | `/api/agent/sessions/:sessionId/activities`    | 脱敏活动时间线              |
| POST   | `/api/agent/sessions/:sessionId/voice/connect` | 获取 WSS 地址和短期 token   |
| POST   | `/api/agent/sessions/:sessionId/lifecycle`     | pause/resume/finish/abandon |
| DELETE | `/api/agent/sessions/:sessionId`               | 删除会话                    |

### 4.1 Readiness

查询参数包含 `interviewMode=text|voice`、可选 Provider 和研究选择。响应状态为 `ready`、`degraded` 或 `blocked`，同时给出 checkpoint 模式、分能力状态、blockers、warnings 和恢复动作。

### 4.2 创建会话

```json
{
  "mode": "single",
  "interviewMode": "text",
  "position": "前端开发工程师",
  "difficulty": "中级",
  "questionCount": 5,
  "jobDescription": "可选",
  "targetCompany": "可选",
  "skillId": "frontend",
  "resumeId": "可选 UUID",
  "brainId": "可选 UUID",
  "useTrainingMemory": true,
  "modelProvider": "deepseek",
  "modelName": "deepseek-v4-flash",
  "webResearch": true
}
```

响应：

```json
{
  "sessionId": "uuid",
  "threadId": "uuid",
  "phase": "preparing",
  "eventCursor": 1
}
```

### 4.3 提交输入

```json
{
  "inputId": "client-stable-id",
  "type": "text",
  "content": "候选人回答"
}
```

相同 `inputId` 返回第一次结果并标记 `duplicate: true`。

### 4.4 SSE

- `Accept: text/event-stream`。
- 重连使用 `Last-Event-ID`。
- 事件名包括 `agent.snapshot`、`agent.phase`、`agent.question_ready`、`agent.message_completed`、`agent.score_completed`、`agent.session_completed`、`agent.activity` 和 `agent.error`。

### 4.5 生命周期

```json
{ "action": "pause" }
```

允许 `pause`、`resume`、`finish`、`abandon`。

## 5. Agent Memory

| 方法   | 路径                | 用途                     |
| ------ | ------------------- | ------------------------ |
| GET    | `/api/agent/memory` | 授权和脱敏摘要           |
| PATCH  | `/api/agent/memory` | `{ "enabled": true }`    |
| DELETE | `/api/agent/memory` | 清除摘要，不删除历史报告 |

## 6. 语音 WebSocket

1. 调用 voice/connect 获取 `wsUrl`。
2. 连接 `WS /api/voice/ws?token=...`。
3. 发送 `hello`，并每 10 秒发送 `heartbeat`。
4. 发送 `audio_start` JSON、二进制 PCM、`audio_end`；重连发送 `resume_session`。

客户端控制事件：

```json
{
  "type": "audio_start",
  "protocolVersion": 1,
  "eventId": "uuid",
  "sequence": 3,
  "sessionId": "uuid",
  "questionId": "uuid",
  "turnId": "stable",
  "sampleRate": 16000
}
```

所有 JSON 事件统一携带 `protocolVersion`、`eventId`、`sequence`。服务端返回 ready、session_ready、connection_state、voice_stage、transcript_partial/final、assistant_audio_*、interrupted、turn_rejected、question_scored、next_question、session_completed 或 error。浏览器本地播放结束后发送 `playback_completed`。

## 7. 题库与简历

### 题库

- `GET /api/bank`
- `GET /api/bank/favorites`
- `GET /api/bank/:id`
- `POST /api/bank/:id/favorite`

### 简历

- `POST /api/resumes`：multipart `file`，最大 10 MB。
- `GET /api/resumes`
- `GET /api/resumes/:id`
- `DELETE /api/resumes/:id`

## 8. 知识库

### 文档

- `GET/POST /api/knowledge/documents`
- `POST /api/knowledge/documents/text`
- `DELETE /api/knowledge/documents/:id`
- `POST /api/knowledge/documents/batch-delete`

### 搜索与 QA

- `POST /api/knowledge/search`
- `GET/POST /api/knowledge/qa/sessions`
- `GET/PATCH/DELETE /api/knowledge/qa/sessions/:id`
- `POST /api/knowledge/qa/sessions/:id/ask`（SSE）

### 图谱与 Brain

- `GET /api/knowledge/graph`
- `GET /api/knowledge/graph/node/:chunkId`
- `PUT /api/knowledge/graph/rebuild`
- `GET/POST /api/knowledge/brains`
- `GET /api/knowledge/brains/default`
- `GET/PATCH/DELETE /api/knowledge/brains/:id`
- `POST /api/knowledge/brains/:id/documents`
- `DELETE /api/knowledge/brains/:id/documents/:docId`

## 9. 文档漂移说明

当前 OpenAPI 聚合仍可能包含未挂载的旧 sessions/questions 路径。修改 API 时必须同时更新 route、OpenAPI 和契约测试；调用方以实际路由为准。
