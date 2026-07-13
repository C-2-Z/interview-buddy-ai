/** OpenAPI 当前路由目录：移除已下线语音 REST 路径并补齐 Agent、生命周期与知识库接口。 */
import { OPENAPI_DOC } from "./openapi.js";

/** OpenAPI 支持的 HTTP 方法。 */
type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/** 用于生成当前增量接口文档的稳定路由定义。 */
type EndpointDefinition = Readonly<{
  /** 带 OpenAPI 花括号参数的完整路径。 */
  path: string;
  /** HTTP 方法。 */
  method: HttpMethod;
  /** Swagger 分组。 */
  tag: "Agent 面试" | "面试生命周期" | "知识库";
  /** 面向调用方的简短用途。 */
  summary: string;
  /** 是否使用 SSE 响应。 */
  stream?: boolean;
}>;

const CURRENT_ENDPOINTS: readonly EndpointDefinition[] = [
  { path: "/api/agent/readiness", method: "get", tag: "Agent 面试", summary: "检查面试创建条件" },
  { path: "/api/agent/sessions", method: "post", tag: "Agent 面试", summary: "创建 Agent 面试" },
  {
    path: "/api/agent/sessions/{sessionId}",
    method: "get",
    tag: "Agent 面试",
    summary: "读取 Agent 快照",
  },
  {
    path: "/api/agent/sessions/{sessionId}/input",
    method: "post",
    tag: "Agent 面试",
    summary: "提交候选人回答",
  },
  {
    path: "/api/agent/sessions/{sessionId}/interrupt",
    method: "post",
    tag: "Agent 面试",
    summary: "打断当前输出",
  },
  {
    path: "/api/agent/sessions/{sessionId}/finish",
    method: "post",
    tag: "Agent 面试",
    summary: "结束 Agent 会话",
  },
  {
    path: "/api/agent/sessions/{sessionId}/retry",
    method: "post",
    tag: "Agent 面试",
    summary: "重试失败阶段",
  },
  {
    path: "/api/agent/sessions/{sessionId}/events",
    method: "get",
    tag: "Agent 面试",
    summary: "订阅持久事件",
    stream: true,
  },
  {
    path: "/api/agent/sessions/{sessionId}/workspace",
    method: "get",
    tag: "Agent 面试",
    summary: "读取完整工作台",
  },
  {
    path: "/api/agent/sessions/{sessionId}/voice/connect",
    method: "post",
    tag: "Agent 面试",
    summary: "获取语音 WebSocket 连接",
  },
  {
    path: "/api/agent/sessions/{sessionId}/lifecycle",
    method: "post",
    tag: "面试生命周期",
    summary: "暂停、恢复、结束或放弃面试",
  },
  {
    path: "/api/agent/sessions/{sessionId}",
    method: "delete",
    tag: "面试生命周期",
    summary: "删除整场面试",
  },
  { path: "/api/knowledge/documents", method: "get", tag: "知识库", summary: "列出知识文档" },
  { path: "/api/knowledge/documents", method: "post", tag: "知识库", summary: "上传知识文档" },
  {
    path: "/api/knowledge/documents/text",
    method: "post",
    tag: "知识库",
    summary: "创建纯文本文档",
  },
  {
    path: "/api/knowledge/documents/{id}",
    method: "delete",
    tag: "知识库",
    summary: "删除知识文档",
  },
  {
    path: "/api/knowledge/documents/batch-delete",
    method: "post",
    tag: "知识库",
    summary: "批量删除知识文档",
  },
  { path: "/api/knowledge/search", method: "post", tag: "知识库", summary: "向量检索知识片段" },
  { path: "/api/knowledge/qa/sessions", method: "get", tag: "知识库", summary: "列出知识问答会话" },
  {
    path: "/api/knowledge/qa/sessions",
    method: "post",
    tag: "知识库",
    summary: "创建知识问答会话",
  },
  {
    path: "/api/knowledge/qa/sessions/{id}",
    method: "get",
    tag: "知识库",
    summary: "读取知识问答会话",
  },
  {
    path: "/api/knowledge/qa/sessions/{id}",
    method: "patch",
    tag: "知识库",
    summary: "更新知识问答会话",
  },
  {
    path: "/api/knowledge/qa/sessions/{id}",
    method: "delete",
    tag: "知识库",
    summary: "删除知识问答会话",
  },
  {
    path: "/api/knowledge/qa/sessions/{id}/ask",
    method: "post",
    tag: "知识库",
    summary: "流式知识问答",
    stream: true,
  },
  { path: "/api/knowledge/graph", method: "get", tag: "知识库", summary: "读取知识图谱" },
  {
    path: "/api/knowledge/graph/node/{chunkId}",
    method: "get",
    tag: "知识库",
    summary: "读取知识片段反链",
  },
  { path: "/api/knowledge/graph/rebuild", method: "put", tag: "知识库", summary: "重建知识图谱" },
  { path: "/api/knowledge/brains", method: "get", tag: "知识库", summary: "列出知识库 Brain" },
  { path: "/api/knowledge/brains", method: "post", tag: "知识库", summary: "创建知识库 Brain" },
  {
    path: "/api/knowledge/brains/default",
    method: "get",
    tag: "知识库",
    summary: "读取或创建默认 Brain",
  },
  { path: "/api/knowledge/brains/{id}", method: "get", tag: "知识库", summary: "读取 Brain 详情" },
  { path: "/api/knowledge/brains/{id}", method: "patch", tag: "知识库", summary: "更新 Brain" },
  { path: "/api/knowledge/brains/{id}", method: "delete", tag: "知识库", summary: "删除 Brain" },
  {
    path: "/api/knowledge/brains/{id}/documents",
    method: "post",
    tag: "知识库",
    summary: "关联 Brain 文档",
  },
  {
    path: "/api/knowledge/brains/{id}/documents/{docId}",
    method: "delete",
    tag: "知识库",
    summary: "移除 Brain 文档",
  },
];

/** 从路径提取 UUID 参数，保证 Swagger 可以直接填写并调用。 */
function buildPathParameters(path: string) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  }));
}

/** 把增量路由定义合并成 OpenAPI paths 对象，同一路径可拥有多个方法。 */
function buildCurrentPaths(): Record<string, Record<string, unknown>> {
  const basePaths = Object.fromEntries(
    Object.entries(OPENAPI_DOC.paths).filter(([path]) => !path.startsWith("/api/voice/")),
  ) as Record<string, Record<string, unknown>>;

  for (const endpoint of CURRENT_ENDPOINTS) {
    const parameters = buildPathParameters(endpoint.path);
    const operation: Record<string, unknown> = {
      tags: [endpoint.tag],
      summary: endpoint.summary,
      responses: {
        "200": {
          description: "成功",
          ...(endpoint.stream
            ? { content: { "text/event-stream": { schema: { type: "string" } } } }
            : { content: { "application/json": { schema: { type: "object" } } } }),
        },
        "401": { description: "未登录或令牌失效" },
        "500": { $ref: "#/components/responses/InternalError" },
      },
    };
    if (parameters.length > 0) operation.parameters = parameters;
    if (["post", "put", "patch"].includes(endpoint.method)) {
      operation.requestBody = {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      };
    }
    basePaths[endpoint.path] = {
      ...(basePaths[endpoint.path] ?? {}),
      [endpoint.method]: operation,
    };
  }
  return basePaths;
}

/** 运行时实际挂载路由对应的 OpenAPI 文档。 */
export const CURRENT_OPENAPI_DOC = {
  ...OPENAPI_DOC,
  info: { ...OPENAPI_DOC.info, version: "1.1.0" },
  components: {
    ...OPENAPI_DOC.components,
    responses: {
      InternalError: {
        description: "服务器内部错误",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
  },
  paths: buildCurrentPaths(),
};
