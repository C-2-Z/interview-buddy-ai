/** Interview Agent Canonical HTTP API 与安全错误适配。 */
import { Hono } from "hono";
import { z } from "zod";
import {
  requireAuth,
  type AuthVariables,
} from "../../shared/auth/require-auth.js";
import { createModuleLogger } from "../../shared/logger/voice-logger.js";
import { createVoiceSocketToken } from "../voice/voice-token.service.js";
import { createAgentWorkspaceRepository } from "./workspace/workspace.repository.js";
import { AgentWorkspaceService } from "./workspace/workspace.service.js";
import { streamCommittedAgentEvents } from "./events/agent-event-stream.js";
import { createInterviewAgentRepository } from "./interview-agent.repository.js";
import { InterviewAgentRepositoryError } from "./interview-agent.repository.js";
import {
  AgentFinishSchema,
  AgentInputSchema,
  AgentInterruptSchema,
  AgentRetrySchema,
  AgentSessionParamsSchema,
  CreateAgentSessionSchema,
} from "./interview-agent.schemas.js";
import {
  createInterviewAgentService,
  InterviewAgentServiceError,
} from "./interview-agent.service.js";

const logger = createModuleLogger("interview-agent-routes");
const interviewAgentRoutes = new Hono<{ Variables: AuthVariables }>();

interviewAgentRoutes.use("*", requireAuth);

/** 将模块错误转换成稳定状态码，未知错误不返回原始消息。 */
interviewAgentRoutes.onError((error, context) => {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return context.json(
      {
        error: "请求参数无效",
        code: "agent_invalid_request",
        retryable: false,
      },
      400,
    );
  }

  if (
    error instanceof InterviewAgentRepositoryError ||
    error instanceof InterviewAgentServiceError
  ) {
    const body = {
      error: error.message,
      code: error.code,
      retryable: error.retryable,
    };
    switch (error.statusCode) {
      case 400:
        return context.json(body, 400);
      case 403:
        return context.json(body, 403);
      case 404:
        return context.json(body, 404);
      case 409:
        return context.json(body, 409);
      case 503:
        return context.json(body, 503);
      default:
        return context.json(body, 500);
    }
  }

  logger.error(new Error("Unhandled Interview Agent route error"), {
    method: context.req.method,
    path: context.req.path,
  });
  return context.json(
    {
      error: "Agent 服务暂时不可用",
      code: "agent_internal_error",
      retryable: true,
    },
    500,
  );
});

/** 创建新 Agent 会话；功能关闭时绝不回退到旧可写流程。 */
interviewAgentRoutes.post("/sessions", async (context) => {
  const input = CreateAgentSessionSchema.parse(
    await context.req.json().catch(() => ({})),
  );
  const service = createInterviewAgentService(
    context.var.supabase,
    context.var.userId,
  );
  return context.json(await service.createSession(input), 202);
});

/** 返回与持久事件流同水位的当前 Agent 快照。 */
interviewAgentRoutes.get("/sessions/:sessionId", async (context) => {
  const { sessionId } = AgentSessionParamsSchema.parse(context.req.param());
  const service = createInterviewAgentService(
    context.var.supabase,
    context.var.userId,
  );
  return context.json(await service.getSession(sessionId));
});

/** 使用唯一 inputId 恢复正在等待回答的 Graph。 */
interviewAgentRoutes.post("/sessions/:sessionId/input", async (context) => {
  const { sessionId } = AgentSessionParamsSchema.parse(context.req.param());
  const input = AgentInputSchema.parse(
    await context.req.json().catch(() => ({})),
  );
  const service = createInterviewAgentService(
    context.var.supabase,
    context.var.userId,
  );
  return context.json(await service.submitInput(sessionId, input));
});

/** 请求取消当前模型或语音输出；Phase 1 无活动输出时明确返回未取消。 */
interviewAgentRoutes.post(
  "/sessions/:sessionId/interrupt",
  async (context) => {
    const { sessionId } = AgentSessionParamsSchema.parse(context.req.param());
    AgentInterruptSchema.parse(await context.req.json().catch(() => ({})));
    const service = createInterviewAgentService(
      context.var.supabase,
      context.var.userId,
    );
    return context.json(await service.interruptSession(sessionId));
  },
);

/** 主动结束会话；Phase 1 只允许读取已经完成的结果，不伪造回答推进 Graph。 */
interviewAgentRoutes.post("/sessions/:sessionId/finish", async (context) => {
  const { sessionId } = AgentSessionParamsSchema.parse(context.req.param());
  AgentFinishSchema.parse(await context.req.json().catch(() => ({})));
  const service = createInterviewAgentService(
    context.var.supabase,
    context.var.userId,
  );
  return context.json(await service.finishSession(sessionId));
});

/** 从业务投影和 checkpoint 重试尚未完成的准备操作。 */
interviewAgentRoutes.post("/sessions/:sessionId/retry", async (context) => {
  const { sessionId } = AgentSessionParamsSchema.parse(context.req.param());
  AgentRetrySchema.parse(await context.req.json().catch(() => ({})));
  const service = createInterviewAgentService(
    context.var.supabase,
    context.var.userId,
  );
  return context.json(await service.retrySession(sessionId), 202);
});

/** 初连发送已提交快照，重连按 Last-Event-ID 补发数据库事件并维持心跳。 */
interviewAgentRoutes.get("/sessions/:sessionId/events", async (context) => {
  const { sessionId } = AgentSessionParamsSchema.parse(context.req.param());
  const repository = createInterviewAgentRepository(context.var.supabase);
  await repository.getOwnedSessionProjection(sessionId);
  return streamCommittedAgentEvents(context, repository, sessionId);
});

/** 返回恢复页面所需的真实题目、消息、研究、证据、评分与报告投影。 */
interviewAgentRoutes.get("/sessions/:sessionId/workspace", async (context) => {
  const { sessionId } = AgentSessionParamsSchema.parse(context.req.param());
  const workspaceService = new AgentWorkspaceService(
    createAgentWorkspaceRepository(context.var.supabase),
  );
  return context.json(await workspaceService.load(sessionId));
});

/** 为 voice 模式 Agent 签发短期 WebSocket token；文本会话不能升级为语音。 */
interviewAgentRoutes.post(
  "/sessions/:sessionId/voice/connect",
  async (context) => {
    const { sessionId } = AgentSessionParamsSchema.parse(context.req.param());
    const repository = createInterviewAgentRepository(context.var.supabase);
    const projection = await repository.getOwnedSessionProjection(sessionId);
    if (projection.interviewMode !== "voice") {
      throw new InterviewAgentServiceError(
        "agent_invalid_phase",
        "This Agent session is not configured for voice.",
        409,
        false,
      );
    }
    const authorization = context.req.header("authorization") ?? "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    const { token, expiresAt } = createVoiceSocketToken({
      sessionId,
      userId: context.var.userId,
      accessToken,
    });
    const url = new URL(context.req.url);
    const forwardedProtocol = context.req.header("x-forwarded-proto");
    url.protocol = (forwardedProtocol ?? url.protocol.replace(":", "")) === "https"
      ? "wss:"
      : "ws:";
    url.pathname = "/api/voice/ws";
    url.search = `?token=${encodeURIComponent(token)}`;
    return context.json({ wsUrl: url.toString(), expiresAt });
  },
);

export { interviewAgentRoutes };
