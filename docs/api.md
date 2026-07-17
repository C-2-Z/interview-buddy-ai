# API 参考

> 状态：当前｜维护者：后端团队｜最后核验：2026-07-16｜代码基线：`main@6958ac3`｜事实源：`apps/api/src/app.ts`、当前 `*.routes.ts`、Zod schema 与 `openapi-current.ts`

## 1. 通用契约

- 本地默认基址：`http://localhost:3001`。
- 除健康检查和 API 文档外，业务接口使用 `Authorization: Bearer <Supabase access token>`。
- JSON 请求必须通过对应 Zod schema；未知字段在严格 schema 中被拒绝。
- 常见响应码：`400` 参数错误、`401` 未认证、`403` 无权访问、`404` 不存在、`409` 状态冲突、`410` 旧能力退役、`500` 内部错误、`503` 依赖未就绪。
- Agent 模块错误结构为 `{ error, code, retryable }`；其他模块至少返回安全的 `{ error }`。
- 本文只列当前挂载接口；精确字段以 schema 和 OpenAPI 为准。

## 2. 基础接口

| 方法 | 路径                      | 认证 | 用途                  |
| ---- | ------------------------- | ---- | --------------------- |
| GET  | `/api/health`             | 否   | API 存活检查          |
| GET  | `/api/openapi.json`       | 否   | 当前 OpenAPI JSON     |
| GET  | `/api/docs`               | 否   | Swagger UI            |
| GET  | `/api/performance/health` | 是   | 当前进程性能/能力状态 |

## 3. Agent readiness 与记忆

| 方法   | 路径                   | 用途                                       |
| ------ | ---------------------- | ------------------------------------------ |
| GET    | `/api/agent/readiness` | 校验 Agent、数据库、模型和语音依赖是否可用 |
| GET    | `/api/agent/memory`    | 获取用户训练记忆授权和聚合摘要             |
| PATCH  | `/api/agent/memory`    | 更新 `{ enabled: boolean }`                |
| DELETE | `/api/agent/memory`    | 清除用户训练记忆                           |

## 4. Agent 会话

| 方法   | 路径                                           | 用途                                     |
| ------ | ---------------------------------------------- | ---------------------------------------- |
| POST   | `/api/agent/sessions`                          | 创建 `agent-v3` 会话，成功返回 `202`     |
| GET    | `/api/agent/sessions/:sessionId`               | 获取当前会话快照                         |
| POST   | `/api/agent/sessions/:sessionId/input`         | 提交唯一 `inputId` 的文本输入            |
| POST   | `/api/agent/sessions/:sessionId/interrupt`     | 请求打断当前模型或语音输出               |
| POST   | `/api/agent/sessions/:sessionId/finish`        | 主动结束会话                             |
| POST   | `/api/agent/sessions/:sessionId/retry`         | 重试最近失败阶段，成功返回 `202`         |
| GET    | `/api/agent/sessions/:sessionId/events`        | SSE 快照、事件重放和心跳                 |
| GET    | `/api/agent/sessions/:sessionId/workspace`     | 获取题目、消息、证据、评分和报告投影     |
| GET    | `/api/agent/sessions/:sessionId/activities`    | 获取用户可见的阶段活动                   |
| POST   | `/api/agent/sessions/:sessionId/lifecycle`     | 执行 `pause/resume/finish/abandon`       |
| DELETE | `/api/agent/sessions/:sessionId`               | 删除当前用户会话及关联 Agent 数据        |
| POST   | `/api/agent/sessions/:sessionId/voice/connect` | 为 voice 会话签发短期 WebSocket 连接信息 |

创建请求核心字段：

```json
{
  "mode": "single",
  "interviewMode": "text",
  "position": "前端工程师",
  "difficulty": "中级",
  "questionCount": 5,
  "jobDescription": "可选，最多 2000 字",
  "targetCompany": "可选",
  "skillId": "可选",
  "resumeId": "可选 UUID",
  "brainId": "可选 UUID",
  "useTrainingMemory": false,
  "modelProvider": "deepseek",
  "modelName": "可选",
  "webResearch": true
}
```

`interviewMode=text` 固定映射 `coaching`，`voice` 固定映射 `simulation`。`questionCount` 范围为 3–10。

新会话内部冻结 `graphVersion=interactive-v2`，但对外 `agentVersion` 仍为 `agent-v3`。历史会话没有 `graphVersion` 时继续使用旧 Graph 与旧 checkpoint namespace。

输入请求：

```json
{
  "inputId": "客户端稳定操作标识",
  "type": "text",
  "content": "1–5000 字的回答"
}
```

`POST /api/agent/sessions/:sessionId/retry` 只恢复服务端已记录的失败操作：

```json
{
  "duplicate": false,
  "recoveryKind": "input",
  "snapshot": {}
}
```

`recoveryKind=preparation` 表示重新执行首题准备；`input` 表示复用原 `inputId`、已持久化回答和 checkpoint，从失败节点继续。客户端不得为同一回答生成新 `inputId` 后再次提交。可恢复模型错误使用稳定码 `agent_question_unavailable`、`agent_decision_unavailable` 或 `agent_scoring_unavailable`，响应 `retryable=true`，并以脱敏 `agent.error` 事件通知客户端。

### 4.1 SSE

- 首连发送已提交快照。
- 重连通过 `Last-Event-ID` 补发持久事件。
- 只暴露当前模式和产品状态允许的事件，不发送回答或内部推理全文。
- 游标无法继续时客户端应重新获取 workspace。

### 4.2 语音 WebSocket

连接信息响应包含 `wsUrl` 与 `expiresAt`，实际升级路径为 `/api/voice/ws`。连接必须验证短期 token、Supabase access token、用户、会话和 voice 模式。客户端控制事件与服务端事件的精确联合类型以 `voice.types.ts` 为准；二进制帧承载音频。

## 5. 历史会话

| 方法 | 路径                | 用途                 |
| ---- | ------------------- | -------------------- |
| GET  | `/api/sessions`     | 获取当前用户会话列表 |
| GET  | `/api/sessions/:id` | 获取当前用户会话详情 |

## 6. 题库与 Skill

| 方法 | 路径                     | 用途              |
| ---- | ------------------------ | ----------------- |
| GET  | `/api/bank`              | 题库列表和筛选    |
| GET  | `/api/bank/favorites`    | 当前用户收藏      |
| GET  | `/api/bank/:id`          | 题目详情          |
| POST | `/api/bank/:id/favorite` | 切换收藏状态      |
| GET  | `/api/skills`            | 岗位 Skill 元数据 |

## 7. 简历与设置

| 方法   | 路径               | 用途                              |
| ------ | ------------------ | --------------------------------- |
| POST   | `/api/resumes`     | multipart 上传并解析简历          |
| GET    | `/api/resumes`     | 当前用户简历列表                  |
| GET    | `/api/resumes/:id` | 当前用户简历详情                  |
| DELETE | `/api/resumes/:id` | 删除简历                          |
| GET    | `/api/settings`    | 获取脱敏用户设置                  |
| PUT    | `/api/settings`    | 更新 Provider、模型和可选 API Key |

设置读取不得返回 API Key 明文。

## 8. 知识库

### 8.1 文档

| 方法   | 路径                                    | 用途                   |
| ------ | --------------------------------------- | ---------------------- |
| POST   | `/api/knowledge/documents`              | multipart 上传知识文档 |
| POST   | `/api/knowledge/documents/text`         | 创建纯文本文档         |
| GET    | `/api/knowledge/documents`              | 文档列表               |
| DELETE | `/api/knowledge/documents/:id`          | 删除文档               |
| POST   | `/api/knowledge/documents/batch-delete` | 批量删除文档           |

### 8.2 QA、搜索与图谱

| 方法             | 路径                                 | 用途                       |
| ---------------- | ------------------------------------ | -------------------------- |
| POST/GET         | `/api/knowledge/qa/sessions`         | 创建/列出 QA 会话          |
| GET/PATCH/DELETE | `/api/knowledge/qa/sessions/:id`     | 获取、重命名或删除 QA 会话 |
| POST             | `/api/knowledge/qa/sessions/:id/ask` | 流式提问并返回引用         |
| POST             | `/api/knowledge/search`              | 语义搜索                   |
| GET              | `/api/knowledge/graph`               | 获取知识图谱               |
| GET              | `/api/knowledge/graph/node/:chunkId` | 获取节点详情               |
| PUT              | `/api/knowledge/graph/rebuild`       | 重建当前用户图谱           |

### 8.3 Brain

| 方法             | 路径                                         | 用途                   |
| ---------------- | -------------------------------------------- | ---------------------- |
| GET              | `/api/knowledge/brains/default`              | 获取默认 Brain         |
| GET/POST         | `/api/knowledge/brains`                      | 列出/创建 Brain        |
| GET/PATCH/DELETE | `/api/knowledge/brains/:id`                  | 获取、更新或删除 Brain |
| POST             | `/api/knowledge/brains/:id/documents`        | 关联文档               |
| DELETE           | `/api/knowledge/brains/:id/documents/:docId` | 解除文档关联           |

## 9. 契约维护

新增或修改端点时必须同步 routes、schema、OpenAPI、前端 API 类型、测试和本文档。`config/openapi.ts` 中残留但未被 `openapi-current.ts` 暴露的旧接口不是当前产品契约。
